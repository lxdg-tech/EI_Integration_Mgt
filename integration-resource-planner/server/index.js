const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const os = require('node:os');
const jwt = require('jsonwebtoken');
const { Client } = require('ldapts');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const {
  checkReaderConnection,
  checkWriterConnection,
  findTicketIds,
  readerPool,
  writerPool,
} = require('./db');

dotenv.config();
const execFileAsync = promisify(execFile);

const app = express();
const port = Number(process.env.API_PORT || '3000');
const host = process.env.API_HOST || '0.0.0.0';

const jwtSecret = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '8h';
const ldapUrl = (process.env.LDAP_URL || '').trim();
const ldapBaseDn = (process.env.LDAP_BASE_DN || '').trim();
const ldapDomain = (process.env.LDAP_DOMAIN || 'utility.pge.com').trim();
const ldapServiceDn = (process.env.LDAP_SERVICE_DN || '').trim();
const ldapServicePassword = (process.env.LDAP_SERVICE_PASSWORD || '').trim();
const ldapUserSearchFilter =
  (process.env.LDAP_USER_SEARCH_FILTER ||
    '(&(objectCategory=person)(objectClass=user)(|(sAMAccountName={{username}})(userPrincipalName={{username}})))').trim();

if (jwtSecret === 'dev-only-secret-change-me') {
  console.warn('JWT_SECRET is not set. Using insecure default secret for development only.');
}

app.use(cors());
app.use(express.json());

function escapeLdapFilterValue(value) {
  return String(value)
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

function normalizeLoginName(rawUsername) {
  return String(rawUsername || '').trim();
}

function getUserPrincipalName(username) {
  if (username.includes('@')) {
    return username;
  }
  return `${username}@${ldapDomain}`;
}

function getAuthorizationToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }
  return authHeader.slice('Bearer '.length).trim();
}

function ldapValueToString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalizedItem = ldapValueToString(item);
      if (normalizedItem) {
        return normalizedItem;
      }
    }
    return '';
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8').trim();
  }

  return String(value).trim();
}

function getLdapAttribute(entry, ...attributeNames) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }

  const keyMap = new Map(
    Object.keys(entry).map((key) => [String(key).toLowerCase(), key])
  );

  for (const name of attributeNames) {
    const matchedKey = keyMap.get(String(name).toLowerCase());
    if (!matchedKey) {
      continue;
    }

    const normalized = ldapValueToString(entry[matchedKey]);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

const ALLOWED_APP_ROLES = new Set(['Admin', 'Resource Manager', 'Practitioner']);

function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user.username,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      sAMAccountName: user.sAMAccountName,
      userPrincipalName: user.userPrincipalName,
      cn: user.cn,
      dn: user.dn,
      department: user.department,
      title: user.title,
      manager: user.manager,
      physicalDeliveryOfficeName: user.physicalDeliveryOfficeName,
      telephoneNumber: user.telephoneNumber,
      appRole: user.appRole || '',
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function requireRole(role) {
  return (req, res, next) => {
    const userRole = String(req.authUser?.appRole || '').trim().toLowerCase();
    if (userRole !== String(role).trim().toLowerCase()) {
      return res.status(403).json({ status: 'error', message: 'Forbidden: insufficient role' });
    }
    return next();
  };
}

function requireAnyRole(roles) {
  const allowedRoles = new Set((roles || []).map((role) => String(role).trim().toLowerCase()));
  return (req, res, next) => {
    const userRole = String(req.authUser?.appRole || '').trim().toLowerCase();
    if (!allowedRoles.has(userRole)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden: insufficient role' });
    }
    return next();
  };
}

async function lookupAppRole(lanId) {
  if (!lanId) return '';
  try {
    const [rows] = await readerPool.query(
      'SELECT role FROM app_user_roles WHERE LOWER(lan_id) = LOWER(?) LIMIT 1',
      [String(lanId)]
    );
    return rows.length > 0 ? rows[0].role : '';
  } catch {
    return '';
  }
}

async function ensureAccessManagementTables() {
  await writerPool.query(`
    CREATE TABLE IF NOT EXISTS app_user_roles (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      lan_id VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL DEFAULT '',
      role VARCHAR(50) NOT NULL DEFAULT 'Practitioner',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_app_user_roles_lan_id (lan_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Seed LXDG as Admin
  await writerPool.query(`
    INSERT INTO app_user_roles (lan_id, name, role)
    VALUES ('LXDG', 'Lyndon Duggs', 'Admin')
    ON DUPLICATE KEY UPDATE name = 'Lyndon Duggs', role = 'Admin'
  `);
}

function verifyJwtToken(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const publicPaths = new Set(['/api/health', '/api/auth/login']);
  if (publicPaths.has(req.path)) {
    return next();
  }

  const token = getAuthorizationToken(req);
  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  try {
    const claims = jwt.verify(token, jwtSecret);
    req.authUser = claims;
    return next();
  } catch {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
  }
}

async function authenticateWithActiveDirectory(username, password) {
  if (!ldapUrl || !ldapBaseDn) {
    throw new Error('LDAP configuration is incomplete. Set LDAP_URL and LDAP_BASE_DN.');
  }

  const normalizedUsername = normalizeLoginName(username);
  const normalizedPassword = String(password || '');

  if (!normalizedUsername || !normalizedPassword) {
    return { success: false, reason: 'Username and password are required.' };
  }

  const client = new Client({
    url: ldapUrl,
    timeout: 10000,
    connectTimeout: 10000,
    tlsOptions: {
      rejectUnauthorized: false,
    },
  });

  try {
    let targetDn = '';
    let resolvedUsername = normalizedUsername;
    let displayName = normalizedUsername;
    let email = '';
    let sAMAccountName = '';
    let userPrincipalName = '';
    let cn = '';
    let dn = '';
    let department = '';
    let title = '';
    let manager = '';
    let physicalDeliveryOfficeName = '';
    let telephoneNumber = '';

    if (ldapServiceDn && ldapServicePassword) {
      await client.bind(ldapServiceDn, ldapServicePassword);

      const searchFilter = ldapUserSearchFilter.replaceAll(
        '{{username}}',
        escapeLdapFilterValue(normalizedUsername)
      );

      const searchResult = await client.search(ldapBaseDn, {
        scope: 'sub',
        filter: searchFilter,
        attributes: [
          'dn',
          'displayName',
          'mail',
          'sAMAccountName',
          'userPrincipalName',
          'cn',
          'department',
          'title',
          'manager',
          'physicalDeliveryOfficeName',
          'telephoneNumber',
        ],
        sizeLimit: 1,
      });

      const firstEntry = searchResult.searchEntries[0];
      if (!firstEntry || !firstEntry.dn) {
        return { success: false, reason: 'Invalid username or password.' };
      }

      targetDn = getLdapAttribute(firstEntry, 'dn', 'distinguishedName');
      resolvedUsername =
        getLdapAttribute(firstEntry, 'userPrincipalName', 'sAMAccountName') || normalizedUsername;
      displayName = getLdapAttribute(firstEntry, 'displayName', 'cn', 'name') || resolvedUsername;
      email = getLdapAttribute(firstEntry, 'mail', 'email');
      sAMAccountName = getLdapAttribute(firstEntry, 'sAMAccountName');
      userPrincipalName = getLdapAttribute(firstEntry, 'userPrincipalName');
      cn = getLdapAttribute(firstEntry, 'cn');
      dn = getLdapAttribute(firstEntry, 'dn', 'distinguishedName');
      department = getLdapAttribute(firstEntry, 'department');
      title = getLdapAttribute(firstEntry, 'title');
      manager = getLdapAttribute(firstEntry, 'manager');
      physicalDeliveryOfficeName = getLdapAttribute(firstEntry, 'physicalDeliveryOfficeName');
      telephoneNumber = getLdapAttribute(firstEntry, 'telephoneNumber');

      await client.bind(targetDn, normalizedPassword);
    } else {
      const bindPrincipalName = getUserPrincipalName(normalizedUsername);
      await client.bind(bindPrincipalName, normalizedPassword);
      resolvedUsername = bindPrincipalName;
      userPrincipalName = bindPrincipalName;
      displayName = normalizedUsername;

      // Search for additional user attributes after successful bind
      try {
        const searchFilter = ldapUserSearchFilter.replaceAll(
          '{{username}}',
          escapeLdapFilterValue(normalizedUsername)
        );

        const searchResult = await client.search(ldapBaseDn, {
          scope: 'sub',
          filter: searchFilter,
          attributes: [
            'dn',
            'displayName',
            'mail',
            'sAMAccountName',
            'userPrincipalName',
            'cn',
            'department',
            'title',
            'manager',
            'physicalDeliveryOfficeName',
            'telephoneNumber',
          ],
          sizeLimit: 1,
        });

        const firstEntry = searchResult.searchEntries[0];
        if (firstEntry) {
          displayName = getLdapAttribute(firstEntry, 'displayName', 'cn', 'name') || normalizedUsername;
          email = getLdapAttribute(firstEntry, 'mail', 'email');
          sAMAccountName = getLdapAttribute(firstEntry, 'sAMAccountName');
          userPrincipalName =
            getLdapAttribute(firstEntry, 'userPrincipalName') || bindPrincipalName;
          cn = getLdapAttribute(firstEntry, 'cn');
          dn = getLdapAttribute(firstEntry, 'dn', 'distinguishedName');
          department = getLdapAttribute(firstEntry, 'department');
          title = getLdapAttribute(firstEntry, 'title');
          manager = getLdapAttribute(firstEntry, 'manager');
          physicalDeliveryOfficeName = getLdapAttribute(firstEntry, 'physicalDeliveryOfficeName');
          telephoneNumber = getLdapAttribute(firstEntry, 'telephoneNumber');
        }
      } catch (searchError) {
        console.warn('[LDAP Search Error after bind]', searchError?.message || String(searchError));
        // Continue with minimal data if search fails
      }
    }

    return {
      success: true,
      user: {
        username: resolvedUsername,
        displayName,
        email,
        sAMAccountName,
        userPrincipalName,
        cn,
        dn,
        department,
        title,
        manager,
        physicalDeliveryOfficeName,
        telephoneNumber,
      },
    };
  } catch (error) {
    const errorMsg = error?.message || String(error);
    console.error('[LDAP Auth Error]', errorMsg);
    return { success: false, reason: 'Invalid username or password.' };
  } finally {
    try {
      await client.unbind();
    } catch {
      // ignore connection cleanup errors
    }
  }
}

async function ensureDeliverablesTable() {
  await writerPool.query(`
    CREATE TABLE IF NOT EXISTS deliverable_mgt (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_name VARCHAR(255) NOT NULL,
      deliverable_name VARCHAR(255) NOT NULL,
      link_to_deliverable VARCHAR(1024) NULL,
      deliverable_type VARCHAR(100) NOT NULL DEFAULT 'Other',
      resource_assigned VARCHAR(255) NOT NULL,
      work_order_number VARCHAR(100) NULL,
      status ENUM('Not Started', 'In Progress', 'Complete') NOT NULL DEFAULT 'Not Started',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_deliverable_project_name (project_name),
      INDEX idx_deliverable_resource (resource_assigned)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const deliverableAlterStatements = [
    `ALTER TABLE deliverable_mgt ADD COLUMN project_name VARCHAR(255) NOT NULL DEFAULT '' AFTER id`,
    `ALTER TABLE deliverable_mgt ADD COLUMN link_to_deliverable VARCHAR(1024) NULL AFTER deliverable_name`,
    `ALTER TABLE deliverable_mgt ADD COLUMN deliverable_type VARCHAR(100) NOT NULL DEFAULT 'Other' AFTER link_to_deliverable`,
    `ALTER TABLE deliverable_mgt ADD COLUMN resource_assigned VARCHAR(255) NOT NULL DEFAULT '' AFTER deliverable_type`,
    `ALTER TABLE deliverable_mgt ADD COLUMN work_order_number VARCHAR(100) NULL AFTER resource_assigned`,
    `ALTER TABLE deliverable_mgt DROP COLUMN target_date`,
  ];

  for (const statement of deliverableAlterStatements) {
    try {
      await writerPool.query(statement);
    } catch (error) {
      if (
        error &&
        error.code !== 'ER_DUP_FIELDNAME' &&
        error.code !== 'ER_CANT_DROP_FIELD_OR_KEY' &&
        error.code !== 'ER_INVALID_USE_OF_NULL'
      ) {
        throw error;
      }
    }
  }

  const [sourceTables] = await readerPool.query(
    `SELECT LOWER(table_name) AS tableName
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND LOWER(table_name) IN ('delivery_team')`
  );

  const existingSourceTables = new Set(sourceTables.map((row) => row.tableName));

  const migrateFromSourceTable = async (sourceTableName) => {
    const [columnRows] = await readerPool.query(
      `SELECT column_name AS columnName
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND LOWER(table_name) = ?`,
      [sourceTableName]
    );

    if (columnRows.length === 0) {
      return;
    }

    const sourceColumns = new Map(
      columnRows.map((column) => [String(column.columnName).toLowerCase(), String(column.columnName)])
    );

    const findColumnRef = (...candidates) => {
      for (const candidate of candidates) {
        const matched = sourceColumns.get(candidate.toLowerCase());
        if (matched) {
          return `\`${matched}\``;
        }
      }
      return null;
    };

    const projectNameExpr = findColumnRef('project_name', 'projectname', 'project_name');
    const deliverableNameExpr = findColumnRef(
      'deliverable_name',
      'deliverablename',
      'deliverable',
      'delivery_name',
      'name'
    );
    const resourceAssignedExpr = findColumnRef(
      'resource_assigned',
      'resourceassigned',
      'resource',
      'resource_name',
      'assigned_resource'
    );

    if (!projectNameExpr || !deliverableNameExpr || !resourceAssignedExpr) {
      return;
    }

    const linkExpr = findColumnRef('link_to_deliverable', 'linktodeliverable', 'deliverable_link', 'link');
    const typeExpr = findColumnRef('deliverable_type', 'deliverabletype', 'type');
    const workOrderExpr = findColumnRef('work_order_number', 'workordernumber', 'work_order', 'workorder');
    const statusExpr = findColumnRef('status', 'deliverable_status');

    const selectProjectName = `TRIM(COALESCE(${projectNameExpr}, ''))`;
    const selectDeliverableName = `TRIM(COALESCE(${deliverableNameExpr}, ''))`;
    const selectResourceAssigned = `TRIM(COALESCE(${resourceAssignedExpr}, ''))`;
    const selectLink = linkExpr
      ? `NULLIF(TRIM(COALESCE(${linkExpr}, '')), '')`
      : 'NULL';
    const selectType = typeExpr
      ? `NULLIF(TRIM(COALESCE(${typeExpr}, '')), '')`
      : `'Other'`;
    const selectWorkOrder = workOrderExpr
      ? `NULLIF(TRIM(COALESCE(${workOrderExpr}, '')), '')`
      : 'NULL';
    const selectStatus = statusExpr
      ? `CASE
           WHEN UPPER(TRIM(COALESCE(${statusExpr}, ''))) = 'NOT STARTED' THEN 'Not Started'
           WHEN UPPER(TRIM(COALESCE(${statusExpr}, ''))) = 'IN PROGRESS' THEN 'In Progress'
           WHEN UPPER(TRIM(COALESCE(${statusExpr}, ''))) = 'COMPLETE' THEN 'Complete'
           ELSE 'Not Started'
         END`
      : `'Not Started'`;

    await writerPool.query(
      `INSERT INTO deliverable_mgt (
         project_name,
         deliverable_name,
         link_to_deliverable,
         deliverable_type,
         resource_assigned,
         work_order_number,
         status
       )
       SELECT
         src.project_name,
         src.deliverable_name,
         src.link_to_deliverable,
         src.deliverable_type,
         src.resource_assigned,
         src.work_order_number,
         src.status
       FROM (
         SELECT
           ${selectProjectName} AS project_name,
           ${selectDeliverableName} AS deliverable_name,
           ${selectLink} AS link_to_deliverable,
           COALESCE(${selectType}, 'Other') AS deliverable_type,
           ${selectResourceAssigned} AS resource_assigned,
           ${selectWorkOrder} AS work_order_number,
           ${selectStatus} AS status
         FROM \`${sourceTableName}\`
       ) src
       WHERE src.project_name <> ''
         AND src.deliverable_name <> ''
         AND src.resource_assigned <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM deliverable_mgt existing
           WHERE existing.project_name = src.project_name
             AND existing.deliverable_name = src.deliverable_name
             AND existing.resource_assigned = src.resource_assigned
             AND COALESCE(existing.work_order_number, '') = COALESCE(src.work_order_number, '')
             AND COALESCE(existing.link_to_deliverable, '') = COALESCE(src.link_to_deliverable, '')
             AND COALESCE(existing.deliverable_type, '') = COALESCE(src.deliverable_type, '')
             AND existing.status = src.status
         )`
    );
  };

  if (existingSourceTables.has('delivery_team')) {
    await migrateFromSourceTable('delivery_team');
    await writerPool.query('DROP TABLE IF EXISTS delivery_team');
  }
}

async function ensureDailyOpReviewTable() {
  await writerPool.query(`
    CREATE TABLE IF NOT EXISTS daily_op_review (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      reporting_date DATE NOT NULL,
      assigned_resource VARCHAR(255) NOT NULL,
      project_name VARCHAR(255) NOT NULL,
      work_order_number VARCHAR(100) NOT NULL,
      planned_for_the_day TEXT NULL,
      issues_and_blockers TEXT NULL,
      catchback_plan TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_dor_reporting_date (reporting_date),
      INDEX idx_dor_assigned_resource (assigned_resource),
      INDEX idx_dor_project_name (project_name),
      INDEX idx_dor_work_order (work_order_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureForecastTable() {
  await writerPool.query(`
    CREATE TABLE IF NOT EXISTS forecast (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      assigned_resource VARCHAR(255) NOT NULL,
      project_name VARCHAR(255) NOT NULL,
      work_order_number VARCHAR(100) NOT NULL,
      estimate DECIMAL(10,2) NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      pbs_est_hours ENUM('Yes', 'No') NULL,
      total_forecasted_hours DECIMAL(10,2) NULL,
      jan_hours DECIMAL(10,2) NULL,
      feb_hours DECIMAL(10,2) NULL,
      mar_hours DECIMAL(10,2) NULL,
      apr_hours DECIMAL(10,2) NULL,
      may_hours DECIMAL(10,2) NULL,
      jun_hours DECIMAL(10,2) NULL,
      jul_hours DECIMAL(10,2) NULL,
      aug_hours DECIMAL(10,2) NULL,
      sep_hours DECIMAL(10,2) NULL,
      oct_hours DECIMAL(10,2) NULL,
      nov_hours DECIMAL(10,2) NULL,
      dec_hours DECIMAL(10,2) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_forecast_entry (assigned_resource, project_name, work_order_number),
      INDEX idx_forecast_assigned_resource (assigned_resource),
      INDEX idx_forecast_project_name (project_name),
      INDEX idx_forecast_work_order (work_order_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeLoginName(req.body?.username);
  const password = String(req.body?.password || '');

  const authResult = await authenticateWithActiveDirectory(username, password);
  if (!authResult.success || !authResult.user) {
    return res.status(401).json({
      status: 'error',
      message: authResult.reason || 'Invalid username or password.',
    });
  }

  const lanId = authResult.user.sAMAccountName || username;
  const appRole = await lookupAppRole(lanId);
  const userWithRole = { ...authResult.user, appRole };
  const token = signAuthToken(userWithRole);

  return res.json({
    status: 'ok',
    token,
    user: userWithRole,
  });
});

app.get('/api/auth/me', verifyJwtToken, async (req, res) => {
  const lanId = req.authUser?.sAMAccountName || req.authUser?.username || '';
  const appRole = await lookupAppRole(lanId);
  return res.json({
    status: 'ok',
    user: {
      username: req.authUser?.username || '',
      displayName: req.authUser?.displayName || req.authUser?.username || '',
      email: req.authUser?.email || '',
      sAMAccountName: req.authUser?.sAMAccountName || '',
      userPrincipalName: req.authUser?.userPrincipalName || '',
      cn: req.authUser?.cn || '',
      dn: req.authUser?.dn || '',
      department: req.authUser?.department || '',
      title: req.authUser?.title || '',
      manager: req.authUser?.manager || '',
      physicalDeliveryOfficeName: req.authUser?.physicalDeliveryOfficeName || '',
      telephoneNumber: req.authUser?.telephoneNumber || '',
      appRole,
    },
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'integration-resource-planner-api' });
});

app.get('/api/db-check', async (_req, res) => {
  try {
    await Promise.all([checkWriterConnection(), checkReaderConnection()]);
    res.json({
      status: 'connected',
      writerHost:
        process.env.DB_WRITER_HOST ||
        process.env.DB_HOST ||
        'ei-aurora-mysql-cluster.cluster-c5nm0uftpga4.us-west-2.rds.amazonaws.com',
      readerHost:
        process.env.DB_READER_HOST ||
        process.env.DB_HOST ||
        'ei-aurora-mysql-cluster.cluster-ro-c5nm0uftpga4.us-west-2.rds.amazonaws.com',
      database: process.env.DB_NAME || 'ei_support',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      details: error.message,
    });
  }
});

app.post('/api/daily-operating-review/token', async (_req, res) => {
  try {
    const tokenUrl =
      process.env.MULESOFT_TOKEN_URL ||
      'https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token';
    const clientId = process.env.MULESOFT_CLIENT_ID || '';
    const clientSecret = process.env.MULESOFT_CLIENT_SECRET || '';

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        status: 'error',
        message: 'MuleSoft OAuth credentials are not configured',
      });
    }

    const curlArgs = [
      '--ssl-no-revoke',
      '--silent',
      '--show-error',
      '--location',
      '--request',
      'POST',
      tokenUrl,
      '--header',
      'Content-Type: application/x-www-form-urlencoded',
      '--data-urlencode',
      `client_id=${clientId}`,
      '--data-urlencode',
      `client_secret=${clientSecret}`,
      '--data-urlencode',
      'grant_type=client_credentials'
    ];

    const { stdout, stderr } = await execFileAsync('curl.exe', curlArgs, {
      windowsHide: true
    });

    return res.json({
      status: 'ok',
      output: stdout,
      errorOutput: stderr || ''
    });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr) : '';
    const message = stderr || error.message;
    return res.status(500).json({
      status: 'error',
      message: 'Unable to retrieve MuleSoft token',
      details: message,
    });
  }
});

app.post('/api/daily-operating-review', async (req, res) => {
  try {
    await ensureDailyOpReviewTable();

    const {
      reportingDate,
      assignedResource,
      projectName,
      workOrderNumber,
      plannedForTheDay,
      issuesAndBlockers,
      catchbackPlan,
    } = req.body || {};

    const normalizedReportingDate = String(reportingDate || '').trim();
    const normalizedAssignedResource = String(assignedResource || '').trim();
    const normalizedProjectName = String(projectName || '').trim();
    const normalizedWorkOrderNumber = String(workOrderNumber || '').trim();
    const normalizedPlannedForTheDay = String(plannedForTheDay || '').trim();
    const normalizedIssuesAndBlockers = String(issuesAndBlockers || '').trim();
    const normalizedCatchbackPlan = String(catchbackPlan || '').trim();

    if (
      !normalizedReportingDate ||
      !normalizedAssignedResource ||
      !normalizedProjectName ||
      !normalizedWorkOrderNumber
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Reporting Date, Assigned Resource, Project Name, and Work Order# are required.',
      });
    }

    const [activeRows] = await readerPool.query(
      `SELECT 1
       FROM resource_mgt
       WHERE resource_assigned = ?
         AND project_name = ?
         AND work_order_number = ?
         AND UPPER(status) <> 'COMPLETE'
         AND UPPER(status) <> 'CLOSED'
       LIMIT 1`,
      [normalizedAssignedResource, normalizedProjectName, normalizedWorkOrderNumber]
    );

    if (activeRows.length === 0) {
      return res.status(400).json({
        status: 'error',
        message:
          'Selected Assigned Resource, Project Name, and Work Order# combination is not active.',
      });
    }

    const [result] = await writerPool.query(
      `INSERT INTO daily_op_review (
         reporting_date,
         assigned_resource,
         project_name,
         work_order_number,
         planned_for_the_day,
         issues_and_blockers,
         catchback_plan
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedReportingDate,
        normalizedAssignedResource,
        normalizedProjectName,
        normalizedWorkOrderNumber,
        normalizedPlannedForTheDay || null,
        normalizedIssuesAndBlockers || null,
        normalizedCatchbackPlan || null,
      ]
    );

    return res.status(201).json({
      status: 'created',
      id: result.insertId,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to save Daily Operating Review entry',
      details: error.message,
    });
  }
});

app.get('/api/daily-operating-review', async (req, res) => {
  try {
    await ensureDailyOpReviewTable();

    const reportingDate = String(req.query.reportingDate || '').trim();
    if (!reportingDate) {
      return res.json({ reports: [] });
    }

    const [rows] = await readerPool.query(
      `SELECT
         id,
         DATE_FORMAT(reporting_date, '%Y-%m-%d') AS reportingDate,
         assigned_resource AS assignedResource,
         project_name AS projectName,
         work_order_number AS workOrderNumber,
         COALESCE(planned_for_the_day, '') AS plannedForTheDay,
         COALESCE(issues_and_blockers, '') AS issuesAndBlockers,
         COALESCE(catchback_plan, '') AS catchbackPlan
       FROM daily_op_review
       WHERE reporting_date = ?
       ORDER BY id DESC`,
      [reportingDate]
    );

    return res.json({ reports: rows });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch Daily Operating Review entries',
      details: error.message,
    });
  }
});

app.put('/api/daily-operating-review/:id', async (req, res) => {
  try {
    await ensureDailyOpReviewTable();

    const reviewId = Number(req.params.id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid review id' });
    }

    const {
      reportingDate,
      assignedResource,
      projectName,
      workOrderNumber,
      plannedForTheDay,
      issuesAndBlockers,
      catchbackPlan,
    } = req.body || {};

    const normalizedReportingDate = String(reportingDate || '').trim();
    const normalizedAssignedResource = String(assignedResource || '').trim();
    const normalizedProjectName = String(projectName || '').trim();
    const normalizedWorkOrderNumber = String(workOrderNumber || '').trim();
    const normalizedPlannedForTheDay = String(plannedForTheDay || '').trim();
    const normalizedIssuesAndBlockers = String(issuesAndBlockers || '').trim();
    const normalizedCatchbackPlan = String(catchbackPlan || '').trim();

    if (
      !normalizedReportingDate ||
      !normalizedAssignedResource ||
      !normalizedProjectName ||
      !normalizedWorkOrderNumber
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Reporting Date, Assigned Resource, Project Name, and Work Order# are required.',
      });
    }

    const [result] = await writerPool.query(
      `UPDATE daily_op_review
       SET reporting_date = ?,
           assigned_resource = ?,
           project_name = ?,
           work_order_number = ?,
           planned_for_the_day = ?,
           issues_and_blockers = ?,
           catchback_plan = ?
       WHERE id = ?`,
      [
        normalizedReportingDate,
        normalizedAssignedResource,
        normalizedProjectName,
        normalizedWorkOrderNumber,
        normalizedPlannedForTheDay || null,
        normalizedIssuesAndBlockers || null,
        normalizedCatchbackPlan || null,
        reviewId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Review entry not found' });
    }

    return res.json({ status: 'updated', id: reviewId });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to update Daily Operating Review entry',
      details: error.message,
    });
  }
});

app.delete('/api/daily-operating-review/:id', async (req, res) => {
  try {
    await ensureDailyOpReviewTable();

    const reviewId = Number(req.params.id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid review id' });
    }

    const [result] = await writerPool.query('DELETE FROM daily_op_review WHERE id = ?', [
      reviewId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Review entry not found' });
    }

    return res.json({ status: 'deleted', id: reviewId });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to delete Daily Operating Review entry',
      details: error.message,
    });
  }
});

app.get('/api/work-orders', async (req, res) => {
  try {
    const startsWith = String(req.query.startsWith || '').trim();

    if (!startsWith) {
      return res.json({ workOrders: [] });
    }

    const workOrders = await findTicketIds(startsWith);
    return res.json({ workOrders });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch work orders',
      details: error.message,
    });
  }
});

app.get('/api/intake-log', async (_req, res) => {
  try {
    const [tableRows] = await readerPool.query(
      `SELECT table_name AS tableName
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND (LOWER(table_name) = 'tickets' OR LOWER(table_name) LIKE '%ticket%')
       ORDER BY CASE WHEN LOWER(table_name) = 'tickets' THEN 0 ELSE 1 END, table_name
       LIMIT 1`
    );

    const ticketsTableName = tableRows.length > 0 ? String(tableRows[0].tableName) : '';
    if (!ticketsTableName) {
      return res.status(500).json({
        status: 'error',
        message: 'Tickets table was not found in the current database.',
      });
    }

    const [columnRows] = await readerPool.query(
      `SELECT column_name AS columnName
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?`,
      [ticketsTableName]
    );

    const columnMap = new Map(
      columnRows.map((row) => [String(row.columnName).toLowerCase(), String(row.columnName)])
    );

    const pickColumn = (...candidates) => {
      for (const candidate of candidates) {
        const matched = columnMap.get(String(candidate).toLowerCase());
        if (matched) {
          return matched;
        }
      }
      return null;
    };

    const ticketIdColumn = pickColumn('ticket_id', 'ticketid', 'ticket_number', 'ticketnumber', 'id');
    const assigneeSupportGroupColumn = pickColumn(
      'assignee_support_group',
      'assigneesupportgroup',
      'assignee_support_group_name',
      'assigneesupportgroupname',
      'assigned_support_group',
      'assignedsupportgroup',
      'support_group',
      'supportgroup'
    );

    if (!ticketIdColumn || !assigneeSupportGroupColumn) {
      return res.status(500).json({
        status: 'error',
        message:
          'Required columns ticket_id and/or assignee_support_group are missing from tickets.',
      });
    }

    const technologyColumn = pickColumn('technology');
    const customerColumn = pickColumn(
      'customer',
      'customer_name',
      'customername',
      'requested_for',
      'requestor',
      'requester'
    );
    const requestTypeColumn = pickColumn('request_type', 'requesttype');
    const orderNumberColumn = pickColumn(
      'order_number',
      'ordernumber',
      'project_order_number',
      'projectordernumber'
    );
    const submitDateColumn = pickColumn('submit_date', 'submitdate', 'submitted_date', 'submitteddate');
    const requestTitleColumn = pickColumn('request_title', 'requesttitle', 'request', 'title');
    const scheduledStartDateColumn = pickColumn('scheduled_start_date', 'scheduledstartdate');
    const scheduledEndDateColumn = pickColumn('scheduled_end_date', 'scheduledenddate');
    const highLevelDescriptionColumn = pickColumn(
      'high_level_description',
      'highleveldescription'
    );

    const charExpr = (columnName) =>
      columnName ? `COALESCE(CAST(\`${columnName}\` AS CHAR), '')` : `''`;

    if (!submitDateColumn) {
      return res.status(500).json({
        status: 'error',
        message: 'Required column submit_date is missing from tickets.',
      });
    }

    const [rows] = await readerPool.query(
      `SELECT
         COALESCE(CAST(\`${ticketIdColumn}\` AS CHAR), '') AS ticketId,
        ${charExpr(customerColumn)} AS customer,
         ${charExpr(technologyColumn)} AS technology,
         ${charExpr(requestTypeColumn)} AS requestType,
         ${charExpr(orderNumberColumn)} AS orderNumber,
         ${charExpr(requestTitleColumn)} AS requestTitle,
         ${charExpr(scheduledStartDateColumn)} AS scheduledStartDate,
         ${charExpr(scheduledEndDateColumn)} AS scheduledEndDate,
         ${charExpr(highLevelDescriptionColumn)} AS highLevelDescription
      FROM \`${ticketsTableName}\`
       WHERE TRIM(COALESCE(CAST(\`${assigneeSupportGroupColumn}\` AS CHAR), '')) = ?
         AND CAST(\`${submitDateColumn}\` AS DATE) >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       ORDER BY \`${ticketIdColumn}\` DESC`,
      ['Enterprise Integration Development']
    );

    return res.json({ intakeLog: rows });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch intake log records',
      details: error.message,
    });
  }
});

app.get('/api/resource-assignments', async (_req, res) => {
  try {
    const [rows] = await readerPool.query(
      `SELECT
         id,
         work_order_number AS workOrderNumber,
         project_name AS projectName,
         project_lead AS projectLead,
         resource_assigned AS resourceAssigned,
         DATE_FORMAT(project_start_date, '%Y-%m-%d') AS projectStartDate,
         DATE_FORMAT(project_end_date, '%Y-%m-%d') AS projectEndDate,
         estimate,
         project_order_number AS projectOrderNumber,
         status
       FROM resource_mgt
       ORDER BY id DESC`
    );

    return res.json({ assignments: rows });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch resource assignments',
      details: error.message,
    });
  }
});

app.post('/api/resource-assignments', async (req, res) => {
  try {
    const {
      workOrderNumber,
      projectName,
      projectLead,
      resourceAssigned,
      projectStartDate,
      projectEndDate,
      estimate,
      projectOrderNumber,
      status,
    } = req.body || {};

    const normalizedWorkOrderNumber = String(workOrderNumber || '').trim();
    const normalizedProjectName = String(projectName || '').trim();
    const normalizedProjectLead = String(projectLead || '').trim();
    const normalizedResourceAssigned = String(resourceAssigned || '').trim();
    const normalizedProjectStartDate = String(projectStartDate || '').trim();
    const normalizedProjectEndDate = String(projectEndDate || '').trim();
    const normalizedEstimate = String(estimate || '').trim();
    const normalizedProjectOrderNumber = String(projectOrderNumber || '').trim();
    const normalizedStatus = String(status || '').trim();

    const allowedStatuses = ['In-Progress', 'Backfill Needed', 'Complete', 'Closed'];

    if (
      !normalizedWorkOrderNumber ||
      !normalizedProjectName ||
      !normalizedProjectLead ||
      !normalizedResourceAssigned ||
      !normalizedProjectStartDate ||
      !normalizedProjectEndDate ||
      !normalizedProjectOrderNumber ||
      !allowedStatuses.includes(normalizedStatus)
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or missing required assignment fields',
      });
    }

    await writerPool.query(
      `INSERT INTO resource_mgt (
         work_order_number,
         project_name,
         project_lead,
         resource_assigned,
         project_start_date,
         project_end_date,
         estimate,
         project_order_number,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedWorkOrderNumber,
        normalizedProjectName,
        normalizedProjectLead,
        normalizedResourceAssigned,
        normalizedProjectStartDate,
        normalizedProjectEndDate,
        normalizedEstimate || null,
        normalizedProjectOrderNumber,
        normalizedStatus,
      ]
    );

    return res.status(201).json({
      status: 'created',
      assignment: {
        workOrderNumber: normalizedWorkOrderNumber,
        projectName: normalizedProjectName,
        projectLead: normalizedProjectLead,
        resourceAssigned: normalizedResourceAssigned,
        projectStartDate: normalizedProjectStartDate,
        projectEndDate: normalizedProjectEndDate,
        estimate: normalizedEstimate || undefined,
        projectOrderNumber: normalizedProjectOrderNumber,
        status: normalizedStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to save resource assignment',
      details: error.message,
    });
  }
});

app.put('/api/resource-assignments/:id', async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid assignment id' });
    }

    const {
      workOrderNumber,
      projectName,
      projectLead,
      resourceAssigned,
      projectStartDate,
      projectEndDate,
      estimate,
      projectOrderNumber,
      status,
    } = req.body || {};

    const normalizedWorkOrderNumber = String(workOrderNumber || '').trim();
    const normalizedProjectName = String(projectName || '').trim();
    const normalizedProjectLead = String(projectLead || '').trim();
    const normalizedResourceAssigned = String(resourceAssigned || '').trim();
    const normalizedProjectStartDate = String(projectStartDate || '').trim();
    const normalizedProjectEndDate = String(projectEndDate || '').trim();
    const normalizedEstimate = String(estimate || '').trim();
    const normalizedProjectOrderNumber = String(projectOrderNumber || '').trim();
    const normalizedStatus = String(status || '').trim();

    const allowedStatuses = ['In-Progress', 'Backfill Needed', 'Complete', 'Closed'];

    if (
      !normalizedWorkOrderNumber ||
      !normalizedProjectName ||
      !normalizedProjectLead ||
      !normalizedResourceAssigned ||
      !normalizedProjectStartDate ||
      !normalizedProjectEndDate ||
      !normalizedProjectOrderNumber ||
      !allowedStatuses.includes(normalizedStatus)
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or missing required assignment fields',
      });
    }

    const [result] = await writerPool.query(
      `UPDATE resource_mgt
       SET work_order_number = ?,
           project_name = ?,
           project_lead = ?,
           resource_assigned = ?,
           project_start_date = ?,
           project_end_date = ?,
           estimate = ?,
           project_order_number = ?,
           status = ?
       WHERE id = ?`,
      [
        normalizedWorkOrderNumber,
        normalizedProjectName,
        normalizedProjectLead,
        normalizedResourceAssigned,
        normalizedProjectStartDate,
        normalizedProjectEndDate,
        normalizedEstimate || null,
        normalizedProjectOrderNumber,
        normalizedStatus,
        assignmentId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Assignment not found' });
    }

    return res.json({
      status: 'updated',
      assignment: {
        id: assignmentId,
        workOrderNumber: normalizedWorkOrderNumber,
        projectName: normalizedProjectName,
        projectLead: normalizedProjectLead,
        resourceAssigned: normalizedResourceAssigned,
        projectStartDate: normalizedProjectStartDate,
        projectEndDate: normalizedProjectEndDate,
        estimate: normalizedEstimate || undefined,
        projectOrderNumber: normalizedProjectOrderNumber,
        status: normalizedStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to update resource assignment',
      details: error.message,
    });
  }
});

app.delete('/api/resource-assignments/:id', async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid assignment id' });
    }

    const [result] = await writerPool.query('DELETE FROM resource_mgt WHERE id = ?', [
      assignmentId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Assignment not found' });
    }

    return res.json({ status: 'deleted', id: assignmentId });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to delete resource assignment',
      details: error.message,
    });
  }
});

app.get('/api/project-orders', async (req, res) => {
  try {
    const resourceAssigned = String(req.query.resourceAssigned || '').trim();

    const conditions = [
      `project_name IS NOT NULL`,
      `project_name <> ''`,
      `UPPER(status) <> 'COMPLETE'`,
      `UPPER(status) <> 'CLOSED'`
    ];
    const params = [];

    if (resourceAssigned) {
      conditions.push('resource_assigned = ?');
      params.push(resourceAssigned);
    }

    const [rows] = await readerPool.query(
      `SELECT DISTINCT project_name AS projectName
       FROM resource_mgt
       WHERE ${conditions.join(' AND ')}
       ORDER BY project_name`,
      params
    );

    return res.json({ projectNames: rows.map((row) => row.projectName) });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch existing projects',
      details: error.message,
    });
  }
});

app.get('/api/project-work-orders', async (req, res) => {
  try {
    const resourceAssigned = String(req.query.resourceAssigned || '').trim();
    const projectName = String(req.query.projectName || '').trim();

    if (!resourceAssigned || !projectName) {
      return res.json({ workOrders: [] });
    }

    const [rows] = await readerPool.query(
      `SELECT DISTINCT work_order_number AS workOrderNumber
       FROM resource_mgt
       WHERE resource_assigned = ?
         AND project_name = ?
         AND work_order_number IS NOT NULL
         AND work_order_number <> ''
         AND UPPER(status) <> 'COMPLETE'
         AND UPPER(status) <> 'CLOSED'
       ORDER BY work_order_number`,
      [resourceAssigned, projectName]
    );

    return res.json({ workOrders: rows.map((row) => row.workOrderNumber) });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch project work orders',
      details: error.message,
    });
  }
});

app.get('/api/project-work-order-estimate', async (req, res) => {
  try {
    const resourceAssigned = String(req.query.resourceAssigned || '').trim();
    const projectName = String(req.query.projectName || '').trim();
    const workOrderNumber = String(req.query.workOrderNumber || '').trim();

    if (!resourceAssigned || !projectName || !workOrderNumber) {
      return res.json({ estimate: '', projectStartDate: '', projectEndDate: '' });
    }

    const [rows] = await readerPool.query(
      `SELECT
        COALESCE(estimate, '') AS estimate,
        COALESCE(DATE_FORMAT(project_start_date, '%Y-%m-%d'), '') AS projectStartDate,
        COALESCE(DATE_FORMAT(project_end_date, '%Y-%m-%d'), '') AS projectEndDate
       FROM resource_mgt
       WHERE resource_assigned = ?
         AND project_name = ?
         AND work_order_number = ?
       LIMIT 1`,
      [resourceAssigned, projectName, workOrderNumber]
    );

    return res.json({
      estimate: rows.length > 0 ? rows[0].estimate : '',
      projectStartDate: rows.length > 0 ? rows[0].projectStartDate : '',
      projectEndDate: rows.length > 0 ? rows[0].projectEndDate : '',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch estimate for selected work order',
      details: error.message,
    });
  }
});

app.get('/api/assigned-resources', async (_req, res) => {
  try {
    const [rows] = await readerPool.query(
      `SELECT DISTINCT resource_assigned AS resourceAssigned
       FROM resource_mgt
       WHERE resource_assigned IS NOT NULL
         AND resource_assigned <> ''
         AND UPPER(status) <> 'COMPLETE'
         AND UPPER(status) <> 'CLOSED'
       ORDER BY resource_assigned`
    );

    return res.json({ resources: rows.map((row) => row.resourceAssigned) });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch assigned resources',
      details: error.message,
    });
  }
});

app.get('/api/forecast-assigned-resources', async (_req, res) => {
  try {
    const [rows] = await readerPool.query(
      `SELECT DISTINCT rm.resource_assigned AS resourceAssigned
       FROM resource_mgt rm
       WHERE rm.resource_assigned IS NOT NULL
         AND rm.resource_assigned <> ''
         AND rm.project_name IS NOT NULL
         AND rm.project_name <> ''
         AND rm.work_order_number IS NOT NULL
         AND rm.work_order_number <> ''
         AND TRIM(UPPER(COALESCE(rm.status, ''))) NOT IN ('COMPLETE', 'CLOSED')
         AND NOT EXISTS (
           SELECT 1
           FROM forecast f
           WHERE f.assigned_resource = rm.resource_assigned
             AND f.project_name = rm.project_name
             AND f.work_order_number = rm.work_order_number
         )
       ORDER BY rm.resource_assigned`
    );

    return res.json({ resources: rows.map((row) => row.resourceAssigned) });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch forecast assigned resources',
      details: error.message,
    });
  }
});

app.get('/api/forecast-update-assigned-resources', async (_req, res) => {
  try {
    const [rows] = await readerPool.query(
      `SELECT DISTINCT rm.resource_assigned AS resourceAssigned
       FROM resource_mgt rm
       WHERE rm.resource_assigned IS NOT NULL
         AND rm.resource_assigned <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM resource_mgt rm2
           WHERE rm2.resource_assigned = rm.resource_assigned
             AND TRIM(UPPER(rm2.status)) IN ('COMPLETE', 'CLOSED')
         )
       ORDER BY rm.resource_assigned`
    );

    return res.json({ resources: rows.map((row) => row.resourceAssigned) });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch forecast update assigned resources',
      details: error.message,
    });
  }
});

app.get('/api/forecast', async (_req, res) => {
  try {
    await ensureForecastTable();

    const [rows] = await readerPool.query(
      `SELECT
         id,
         assigned_resource AS assignedResource,
         project_name AS projectName,
         work_order_number AS workOrderNumber,
         COALESCE(estimate, 0) AS estimate,
         COALESCE(DATE_FORMAT(start_date, '%Y-%m-%d'), '') AS startDate,
         COALESCE(DATE_FORMAT(end_date, '%Y-%m-%d'), '') AS endDate,
         COALESCE(pbs_est_hours, '') AS pbsEstHours,
         COALESCE(total_forecasted_hours, 0) AS totalForecastedHours,
         COALESCE(jan_hours, 0) AS janHours,
         COALESCE(feb_hours, 0) AS febHours,
         COALESCE(mar_hours, 0) AS marHours,
         COALESCE(apr_hours, 0) AS aprHours,
         COALESCE(may_hours, 0) AS mayHours,
         COALESCE(jun_hours, 0) AS junHours,
         COALESCE(jul_hours, 0) AS julHours,
         COALESCE(aug_hours, 0) AS augHours,
         COALESCE(sep_hours, 0) AS sepHours,
         COALESCE(oct_hours, 0) AS octHours,
         COALESCE(nov_hours, 0) AS novHours,
         COALESCE(dec_hours, 0) AS decHours,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
       FROM forecast
       ORDER BY id DESC`
    );

    return res.json({ forecasts: rows });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch forecast records',
      details: error.message,
    });
  }
});

app.get('/api/forecast-missing', async (_req, res) => {
  try {
    await ensureForecastTable();

    const [rows] = await readerPool.query(
      `SELECT
         rm.id AS resourceAssignmentId,
         rm.resource_assigned AS assignedResource,
         rm.project_name AS projectName,
         rm.work_order_number AS workOrderNumber,
         COALESCE(rm.estimate, 0) AS estimatedHours,
         COALESCE(DATE_FORMAT(rm.project_start_date, '%Y-%m-%d'), '') AS startDate,
         COALESCE(DATE_FORMAT(rm.project_end_date, '%Y-%m-%d'), '') AS endDate,
         rm.status AS status
       FROM resource_mgt rm
       WHERE rm.resource_assigned IS NOT NULL
         AND rm.resource_assigned <> ''
         AND rm.project_name IS NOT NULL
         AND rm.project_name <> ''
         AND rm.work_order_number IS NOT NULL
         AND rm.work_order_number <> ''
         AND TRIM(UPPER(rm.status)) NOT IN ('COMPLETE', 'CLOSED')
         AND NOT EXISTS (
           SELECT 1
           FROM forecast f
           WHERE f.assigned_resource = rm.resource_assigned
             AND f.project_name = rm.project_name
             AND f.work_order_number = rm.work_order_number
         )
       ORDER BY rm.id DESC`
    );

    return res.json({ missingForecasts: rows });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch missing forecast records',
      details: error.message,
    });
  }
});

app.post('/api/forecast', async (req, res) => {
  try {
    await ensureForecastTable();

    const body = req.body || {};
    const assignedResource = String(body.assignedResource || '').trim();
    const projectName = String(body.projectName || '').trim();
    const workOrderNumber = String(body.workOrderNumber || '').trim();
    const startDate = String(body.startDate || '').trim();
    const endDate = String(body.endDate || '').trim();
    const pbsEstHours = String(body.pbsEstHours || '').trim();

    if (!assignedResource || !projectName || !workOrderNumber || !startDate) {
      return res.status(400).json({
        status: 'error',
        message:
          'Assigned Resource, Project, Work Order Number, and Start Date are required for forecast save.',
      });
    }

    const startDateMatch = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startDateMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'Start Date must be in YYYY-MM-DD format.',
      });
    }
    const normalizeDecimal = (value) => {
      const cleaned = String(value ?? '').trim().replace(/[^0-9.-]/g, '');
      if (!cleaned) {
        return null;
      }

      const parsed = Number.parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const normalizeDate = (value) => {
      const normalized = String(value || '').trim();
      if (!normalized) {
        return null;
      }

      return /^(\d{4})-(\d{2})-(\d{2})$/.test(normalized) ? normalized : null;
    };

    const normalizedPbs = pbsEstHours === 'Yes' || pbsEstHours === 'No' ? pbsEstHours : null;

    const [existingRows] = await readerPool.query(
      `SELECT id
       FROM forecast
       WHERE assigned_resource = ?
         AND project_name = ?
         AND work_order_number = ?
       LIMIT 1`,
      [assignedResource, projectName, workOrderNumber]
    );

    if (existingRows.length > 0) {
      return res.status(409).json({
        status: 'error',
        code: 'FORECAST_EXISTS',
        message:
          'Hazard: A forecast already exists for this Assigned Resource, Project, and Work Order Number. Use Update to modify the forecast.',
      });
    }

    const [result] = await writerPool.query(
      `INSERT INTO forecast (
         assigned_resource,
         project_name,
         work_order_number,
         estimate,
         start_date,
         end_date,
         pbs_est_hours,
         total_forecasted_hours,
         jan_hours,
         feb_hours,
         mar_hours,
         apr_hours,
         may_hours,
         jun_hours,
         jul_hours,
         aug_hours,
         sep_hours,
         oct_hours,
         nov_hours,
         dec_hours
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assignedResource,
        projectName,
        workOrderNumber,
        normalizeDecimal(body.estimate),
        normalizeDate(startDate),
        normalizeDate(endDate),
        normalizedPbs,
        normalizeDecimal(body.totalForecastedHours),
        normalizeDecimal(body.janHours),
        normalizeDecimal(body.febHours),
        normalizeDecimal(body.marHours),
        normalizeDecimal(body.aprHours),
        normalizeDecimal(body.mayHours),
        normalizeDecimal(body.junHours),
        normalizeDecimal(body.julHours),
        normalizeDecimal(body.augHours),
        normalizeDecimal(body.sepHours),
        normalizeDecimal(body.octHours),
        normalizeDecimal(body.novHours),
        normalizeDecimal(body.decHours),
      ]
    );

    return res.status(200).json({
      status: 'saved',
      id: result.insertId,
    });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        status: 'error',
        code: 'FORECAST_EXISTS',
        message:
          'Hazard: A forecast already exists for this Assigned Resource, Project, and Work Order Number. Use Update to modify the forecast.',
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Unable to save forecast entry',
      details: error.message,
    });
  }
});

app.put('/api/forecast/:id', async (req, res) => {
  try {
    await ensureForecastTable();

    const forecastId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(forecastId) || forecastId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid forecast id.',
      });
    }

    const body = req.body || {};
    const assignedResource = String(body.assignedResource || '').trim();
    const projectName = String(body.projectName || '').trim();
    const workOrderNumber = String(body.workOrderNumber || '').trim();
    const startDate = String(body.startDate || '').trim();
    const endDate = String(body.endDate || '').trim();
    const pbsEstHours = String(body.pbsEstHours || '').trim();

    if (!assignedResource || !projectName || !workOrderNumber || !startDate) {
      return res.status(400).json({
        status: 'error',
        message:
          'Assigned Resource, Project, Work Order Number, and Start Date are required for forecast update.',
      });
    }

    const normalizeDecimal = (value) => {
      const cleaned = String(value ?? '').trim().replace(/[^0-9.-]/g, '');
      if (!cleaned) {
        return null;
      }

      const parsed = Number.parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const normalizeDate = (value) => {
      const normalized = String(value || '').trim();
      if (!normalized) {
        return null;
      }

      return /^(\d{4})-(\d{2})-(\d{2})$/.test(normalized) ? normalized : null;
    };

    if (!normalizeDate(startDate)) {
      return res.status(400).json({
        status: 'error',
        message: 'Start Date must be in YYYY-MM-DD format.',
      });
    }

    const normalizedPbs = pbsEstHours === 'Yes' || pbsEstHours === 'No' ? pbsEstHours : null;

    const [duplicateRows] = await readerPool.query(
      `SELECT id
       FROM forecast
       WHERE assigned_resource = ?
         AND project_name = ?
         AND work_order_number = ?
         AND id <> ?
       LIMIT 1`,
      [assignedResource, projectName, workOrderNumber, forecastId]
    );

    if (duplicateRows.length > 0) {
      return res.status(409).json({
        status: 'error',
        code: 'FORECAST_EXISTS',
        message:
          'A forecast already exists for this Assigned Resource, Project, and Work Order Number.',
      });
    }

    const [result] = await writerPool.query(
      `UPDATE forecast
       SET assigned_resource = ?,
           project_name = ?,
           work_order_number = ?,
           estimate = ?,
           start_date = ?,
           end_date = ?,
           pbs_est_hours = ?,
           total_forecasted_hours = ?,
           jan_hours = ?,
           feb_hours = ?,
           mar_hours = ?,
           apr_hours = ?,
           may_hours = ?,
           jun_hours = ?,
           jul_hours = ?,
           aug_hours = ?,
           sep_hours = ?,
           oct_hours = ?,
           nov_hours = ?,
           dec_hours = ?
       WHERE id = ?`,
      [
        assignedResource,
        projectName,
        workOrderNumber,
        normalizeDecimal(body.estimate),
        normalizeDate(startDate),
        normalizeDate(endDate),
        normalizedPbs,
        normalizeDecimal(body.totalForecastedHours),
        normalizeDecimal(body.janHours),
        normalizeDecimal(body.febHours),
        normalizeDecimal(body.marHours),
        normalizeDecimal(body.aprHours),
        normalizeDecimal(body.mayHours),
        normalizeDecimal(body.junHours),
        normalizeDecimal(body.julHours),
        normalizeDecimal(body.augHours),
        normalizeDecimal(body.sepHours),
        normalizeDecimal(body.octHours),
        normalizeDecimal(body.novHours),
        normalizeDecimal(body.decHours),
        forecastId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Forecast entry not found.',
      });
    }

    return res.json({
      status: 'updated',
      id: forecastId,
    });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        status: 'error',
        code: 'FORECAST_EXISTS',
        message:
          'A forecast already exists for this Assigned Resource, Project, and Work Order Number.',
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Unable to update forecast entry',
      details: error.message,
    });
  }
});

app.delete('/api/forecast/:id', async (req, res) => {
  try {
    await ensureForecastTable();

    const forecastId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(forecastId) || forecastId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid forecast id.',
      });
    }

    const [result] = await writerPool.query('DELETE FROM forecast WHERE id = ?', [forecastId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Forecast entry not found.',
      });
    }

    return res.json({
      status: 'deleted',
      id: forecastId,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to delete forecast entry',
      details: error.message,
    });
  }
});

app.get('/api/deliverables', async (_req, res) => {
  try {
    await ensureDeliverablesTable();

    const [rows] = await readerPool.query(
      `SELECT
         id,
         project_name AS projectName,
         deliverable_name AS deliverableName,
         COALESCE(link_to_deliverable, '') AS linkToDeliverable,
         COALESCE(deliverable_type, '') AS deliverableType,
         resource_assigned AS resourceAssigned,
         COALESCE(work_order_number, '') AS workOrderNumber,
         status
       FROM deliverable_mgt
       ORDER BY id DESC`
    );

    return res.json({ deliverables: rows });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch deliverables',
      details: error.message,
    });
  }
});

app.post('/api/deliverables', async (req, res) => {
  try {
    await ensureDeliverablesTable();

    const {
      projectName,
      projectOrderNumber,
      deliverableName,
      linkToDeliverable,
      deliverableType,
      resourceAssigned,
      workOrderNumber,
      targetDate,
      status,
    } = req.body || {};

    const providedProjectName = String(projectName || projectOrderNumber || '').trim();
    const normalizedDeliverableName = String(deliverableName || '').trim();
    const normalizedLinkToDeliverable = String(linkToDeliverable || '').trim();
    const normalizedDeliverableType = String(deliverableType || '').trim();
    const normalizedResourceAssigned = String(resourceAssigned || '').trim();
    const normalizedWorkOrderNumber = String(workOrderNumber || '').trim();
    const normalizedStatus = String(status || '').trim();

    const allowedStatuses = ['Not Started', 'In Progress', 'Complete'];
    const allowedDeliverableTypes = [
      'Estimate',
      'Technical Design',
      'MuleSoft Exchange Entry',
      'Solution Blue Print',
      'ARB Approval',
      'CRQ',
      'Other',
    ];

    if (
      !normalizedDeliverableName ||
      !normalizedLinkToDeliverable ||
      !normalizedDeliverableType ||
      !normalizedResourceAssigned ||
      !normalizedWorkOrderNumber ||
      !allowedStatuses.includes(normalizedStatus) ||
      !allowedDeliverableTypes.includes(normalizedDeliverableType)
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or missing required deliverable fields',
      });
    }

    let normalizedProjectName = providedProjectName;

    if (!normalizedProjectName) {
      const [projectLookupRows] = await readerPool.query(
        `SELECT project_name AS projectName
         FROM resource_mgt
         WHERE resource_assigned = ?
           AND project_name IS NOT NULL
           AND project_name <> ''
           AND UPPER(status) <> 'COMPLETE'
           AND UPPER(status) <> 'CLOSED'
         ORDER BY id DESC
         LIMIT 1`,
        [normalizedResourceAssigned]
      );

      if (projectLookupRows.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No active project found for the selected Resource Assigned',
        });
      }

      normalizedProjectName = String(projectLookupRows[0].projectName || '').trim();
    }

    const [projectRows] = await readerPool.query(
      `SELECT 1
       FROM resource_mgt
       WHERE project_name = ?
         AND resource_assigned = ?
         AND work_order_number = ?
         AND UPPER(status) <> 'COMPLETE'
         AND UPPER(status) <> 'CLOSED'
       LIMIT 1`,
      [normalizedProjectName, normalizedResourceAssigned, normalizedWorkOrderNumber]
    );

    if (projectRows.length === 0) {
      return res.status(400).json({
        status: 'error',
        message:
          'Work Order# is not active for the selected Resource Assigned and Project Name',
      });
    }

    await writerPool.query(
      `INSERT INTO deliverable_mgt (
        project_name,
         deliverable_name,
         link_to_deliverable,
         deliverable_type,
        resource_assigned,
         work_order_number,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedProjectName,
        normalizedDeliverableName,
        normalizedLinkToDeliverable,
        normalizedDeliverableType,
        normalizedResourceAssigned,
        normalizedWorkOrderNumber,
        normalizedStatus,
      ]
    );

    return res.status(201).json({
      status: 'created',
      deliverable: {
        projectName: normalizedProjectName,
        deliverableName: normalizedDeliverableName,
        linkToDeliverable: normalizedLinkToDeliverable,
        deliverableType: normalizedDeliverableType,
        resourceAssigned: normalizedResourceAssigned,
        workOrderNumber: normalizedWorkOrderNumber,
        status: normalizedStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to save deliverable',
      details: error.message,
    });
  }
});

app.put('/api/deliverables/:id', async (req, res) => {
  try {
    await ensureDeliverablesTable();

    const deliverableId = Number(req.params.id);
    if (!Number.isInteger(deliverableId) || deliverableId <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid deliverable id' });
    }

    const {
      projectName,
      deliverableName,
      linkToDeliverable,
      deliverableType,
      resourceAssigned,
      workOrderNumber,
      status,
    } = req.body || {};

    const normalizedProjectName = String(projectName || '').trim();
    const normalizedDeliverableName = String(deliverableName || '').trim();
    const normalizedLinkToDeliverable = String(linkToDeliverable || '').trim();
    const normalizedDeliverableType = String(deliverableType || '').trim();
    const normalizedResourceAssigned = String(resourceAssigned || '').trim();
    const normalizedWorkOrderNumber = String(workOrderNumber || '').trim();
    const normalizedStatus = String(status || '').trim();

    const allowedStatuses = ['Not Started', 'In Progress', 'Complete'];
    const allowedDeliverableTypes = [
      'Estimate',
      'Technical Design',
      'MuleSoft Exchange Entry',
      'Solution Blue Print',
      'ARB Approval',
      'CRQ',
      'Other',
    ];

    if (
      !normalizedProjectName ||
      !normalizedDeliverableName ||
      !normalizedLinkToDeliverable ||
      !normalizedDeliverableType ||
      !normalizedResourceAssigned ||
      !normalizedWorkOrderNumber ||
      !allowedStatuses.includes(normalizedStatus) ||
      !allowedDeliverableTypes.includes(normalizedDeliverableType)
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or missing required deliverable fields',
      });
    }

    const [projectRows] = await readerPool.query(
      `SELECT 1
       FROM resource_mgt
       WHERE project_name = ?
         AND resource_assigned = ?
         AND work_order_number = ?
         AND UPPER(status) <> 'COMPLETE'
         AND UPPER(status) <> 'CLOSED'
       LIMIT 1`,
      [normalizedProjectName, normalizedResourceAssigned, normalizedWorkOrderNumber]
    );

    if (projectRows.length === 0) {
      return res.status(400).json({
        status: 'error',
        message:
          'Work Order# is not active for the selected Resource Assigned and Project Name',
      });
    }

    const [result] = await writerPool.query(
        `UPDATE deliverable_mgt
       SET project_name = ?,
           deliverable_name = ?,
           link_to_deliverable = ?,
           deliverable_type = ?,
           resource_assigned = ?,
           work_order_number = ?,
           status = ?
       WHERE id = ?`,
      [
        normalizedProjectName,
        normalizedDeliverableName,
        normalizedLinkToDeliverable,
        normalizedDeliverableType,
        normalizedResourceAssigned,
        normalizedWorkOrderNumber,
        normalizedStatus,
        deliverableId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Deliverable not found' });
    }

    return res.json({
      status: 'updated',
      deliverable: {
        id: deliverableId,
        projectName: normalizedProjectName,
        deliverableName: normalizedDeliverableName,
        linkToDeliverable: normalizedLinkToDeliverable,
        deliverableType: normalizedDeliverableType,
        resourceAssigned: normalizedResourceAssigned,
        workOrderNumber: normalizedWorkOrderNumber,
        status: normalizedStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to update deliverable',
      details: error.message,
    });
  }
});

app.delete('/api/deliverables/:id', async (req, res) => {
  try {
    await ensureDeliverablesTable();

    const deliverableId = Number(req.params.id);
    if (!Number.isInteger(deliverableId) || deliverableId <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid deliverable id' });
    }

    const [result] = await writerPool.query('DELETE FROM deliverable_mgt WHERE id = ?', [deliverableId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Deliverable not found' });
    }

    return res.json({ status: 'deleted', id: deliverableId });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to delete deliverable',
      details: error.message,
    });
  }
});

app.get('/api/roles', verifyJwtToken, (_req, res) => {
  return res.json({ roles: ['Admin', 'Resource Manager', 'Practitioner'] });
});

async function resolveUsersTableMetadata(pool) {
  const [tableRows] = await pool.query(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND LOWER(table_name) = 'users'
     LIMIT 1`
  );

  if (tableRows.length === 0) {
    return null;
  }

  const usersTableName = String(tableRows[0].tableName || '').trim();
  if (!usersTableName) {
    return null;
  }

  const [colRows] = await pool.query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND LOWER(table_name) = 'users'`
  );

  const colSet = new Set(colRows.map((r) => String(r.columnName).toLowerCase()));
  const lanIdCol = ['Lan Id', 'lan_id', 'lanid', 'LAN_ID'].find((c) => colSet.has(c.toLowerCase()));
  const nameCol = ['Name', 'name', 'full_name', 'fullname'].find((c) => colSet.has(c.toLowerCase()));

  if (!lanIdCol || !nameCol) {
    return null;
  }

  const usersTableNameEscaped = `\`${usersTableName.replace(/`/g, '``')}\``;
  const lanIdColEscaped = `\`${String(lanIdCol).replace(/`/g, '``')}\``;
  const nameColEscaped = `\`${String(nameCol).replace(/`/g, '``')}\``;

  return {
    usersTableNameEscaped,
    lanIdColEscaped,
    nameColEscaped,
  };
}

app.get('/api/admin/users', verifyJwtToken, requireAnyRole(['Admin', 'Resource Manager']), async (_req, res) => {
  try {
    const usersMetadata = await resolveUsersTableMetadata(readerPool);
    if (!usersMetadata) {
      // Users table not yet created — return only app_user_roles entries
      const [roleRows] = await readerPool.query(
        `SELECT lan_id AS lanId, name, role
         FROM app_user_roles
         ORDER BY name`
      );
      return res.json({ users: roleRows });
    }

     const [rows] = await readerPool.query(`
      SELECT
         COALESCE(CAST(u.${usersMetadata.lanIdColEscaped} AS CHAR), '') AS lanId,
         COALESCE(CAST(u.${usersMetadata.nameColEscaped} AS CHAR), '') AS name,
         COALESCE(r.role, '') AS role
       FROM ${usersMetadata.usersTableNameEscaped} u
       LEFT JOIN app_user_roles r
        ON CAST(r.lan_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
         = CAST(u.${usersMetadata.lanIdColEscaped} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
       WHERE COALESCE(CAST(u.${usersMetadata.lanIdColEscaped} AS CHAR), '') <> ''
       ORDER BY COALESCE(CAST(u.${usersMetadata.nameColEscaped} AS CHAR), '')
    `);

    return res.json({ users: rows });
  } catch (error) {
    console.error('[/api/admin/users error]', error);
    try {
      const [roleRows] = await readerPool.query(
        `SELECT lan_id AS lanId, name, role
         FROM app_user_roles
         ORDER BY name`
      );
      return res.json({ users: roleRows });
    } catch (fallbackError) {
      console.error('[/api/admin/users fallback error]', fallbackError);
      return res.status(500).json({
        status: 'error',
        message: 'Unable to fetch users',
      });
    }
  }
});

app.post('/api/admin/users', verifyJwtToken, requireRole('Admin'), async (req, res) => {
  try {
    const lanId = String(req.body?.lanId || '').trim();
    const name = String(req.body?.name || '').trim();

    if (!lanId || !name) {
      return res.status(400).json({ status: 'error', message: 'lanId and name are required' });
    }

    const usersMetadata = await resolveUsersTableMetadata(writerPool);
    if (!usersMetadata) {
      return res.status(400).json({ status: 'error', message: 'Users table is not available' });
    }

    const [existingRows] = await writerPool.query(
      `SELECT 1
       FROM ${usersMetadata.usersTableNameEscaped}
       WHERE LOWER(CAST(${usersMetadata.lanIdColEscaped} AS CHAR)) = LOWER(?)
       LIMIT 1`,
      [lanId]
    );

    if (existingRows.length > 0) {
      return res.status(409).json({ status: 'error', message: 'User already exists' });
    }

    await writerPool.query(
      `INSERT INTO ${usersMetadata.usersTableNameEscaped} (${usersMetadata.lanIdColEscaped}, ${usersMetadata.nameColEscaped})
       VALUES (?, ?)`,
      [lanId, name]
    );

    return res.status(201).json({ status: 'ok', user: { lanId, name } });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to add user',
      details: error.message,
    });
  }
});

app.put('/api/admin/users', verifyJwtToken, requireRole('Admin'), async (req, res) => {
  try {
    const originalLanId = String(req.body?.originalLanId || '').trim();
    const lanId = String(req.body?.lanId || '').trim();
    const name = String(req.body?.name || '').trim();

    if (!originalLanId || !lanId || !name) {
      return res.status(400).json({ status: 'error', message: 'originalLanId, lanId and name are required' });
    }

    const usersMetadata = await resolveUsersTableMetadata(writerPool);
    if (!usersMetadata) {
      return res.status(400).json({ status: 'error', message: 'Users table is not available' });
    }

    const [result] = await writerPool.query(
      `UPDATE ${usersMetadata.usersTableNameEscaped}
       SET ${usersMetadata.lanIdColEscaped} = ?, ${usersMetadata.nameColEscaped} = ?
       WHERE LOWER(CAST(${usersMetadata.lanIdColEscaped} AS CHAR)) = LOWER(?)`,
      [lanId, name, originalLanId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    await writerPool.query(
      `UPDATE app_user_roles
       SET lan_id = ?, name = ?
       WHERE LOWER(lan_id) = LOWER(?)`,
      [lanId, name, originalLanId]
    );

    return res.json({ status: 'ok', user: { lanId, name } });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to update user',
      details: error.message,
    });
  }
});

app.delete('/api/admin/users/:lanId', verifyJwtToken, requireRole('Admin'), async (req, res) => {
  try {
    const lanId = String(req.params?.lanId || '').trim();
    if (!lanId) {
      return res.status(400).json({ status: 'error', message: 'lanId is required' });
    }

    const usersMetadata = await resolveUsersTableMetadata(writerPool);
    if (!usersMetadata) {
      return res.status(400).json({ status: 'error', message: 'Users table is not available' });
    }

    const [result] = await writerPool.query(
      `DELETE FROM ${usersMetadata.usersTableNameEscaped}
       WHERE LOWER(CAST(${usersMetadata.lanIdColEscaped} AS CHAR)) = LOWER(?)`,
      [lanId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    await writerPool.query('DELETE FROM app_user_roles WHERE LOWER(lan_id) = LOWER(?)', [lanId]);

    return res.json({ status: 'ok', lanId });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to delete user',
      details: error.message,
    });
  }
});

app.put('/api/admin/users/role', verifyJwtToken, requireRole('Admin'), async (req, res) => {
  try {
    const lanId = String(req.body?.lanId || '').trim();
    const name = String(req.body?.name || '').trim();
    const role = String(req.body?.role || '').trim();

    if (!lanId) {
      return res.status(400).json({ status: 'error', message: 'lanId is required' });
    }

    if (role && !ALLOWED_APP_ROLES.has(role)) {
      return res.status(400).json({ status: 'error', message: 'Invalid role value' });
    }

    if (!role) {
      // Remove role assignment
      await writerPool.query('DELETE FROM app_user_roles WHERE LOWER(lan_id) = LOWER(?)', [lanId]);
      return res.json({ status: 'ok', lanId, role: '' });
    }

    await writerPool.query(
      `INSERT INTO app_user_roles (lan_id, name, role)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`,
      [lanId, name || lanId, role]
    );

    return res.json({ status: 'ok', lanId, name: name || lanId, role });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to update user role',
      details: error.message,
    });
  }
});

function startServer() {
  app.listen(port, host, () => {
  const networkInterfaces = os.networkInterfaces();
  const firstIpv4 = Object.values(networkInterfaces)
    .flat()
    .find((entry) => entry && entry.family === 'IPv4' && !entry.internal);
  const lanHost = firstIpv4 ? firstIpv4.address : 'YOUR_MACHINE_IP';

  console.log(`API listening on http://localhost:${port}`);
  console.log(`API LAN access: http://${lanHost}:${port}`);

  Promise.all([checkWriterConnection(), checkReaderConnection()])
    .then(() => {
      console.log('Database connectivity check passed (writer + reader).');
      return ensureAccessManagementTables();
    })
    .then(() => {
      console.log('Access management tables verified.');
    })
    .catch((error) => {
      console.error('Startup initialization failed:', error.message);
      console.error(
        'Tip: set DB_SSL=false for local/non-SSL MySQL, or DB_SSL=true for managed SSL databases.'
      );
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;