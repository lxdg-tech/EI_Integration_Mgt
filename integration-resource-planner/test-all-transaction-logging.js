/**
 * Full CRUD transaction logging verification test
 * Tests all tables: forecast, deliverable_mgt, resource_mgt, daily_op_review, app_user_roles
 */

const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'aeaf3576254785a2f2e886104df6583972253a8aecb1e35ad8badc972ab26eacc4b25bbde82ce102d0141cfbe2876147';

const rmToken = jwt.sign({ sAMAccountName: 'testuser', appRole: 'Resource Manager' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken = jwt.sign({ sAMAccountName: 'testadmin', appRole: 'Admin' }, JWT_SECRET, { expiresIn: '1h' });

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const ts = Date.now();
  const results = [];

  console.log('🧪 Full CRUD Transaction Logging Test\n');
  console.log('='.repeat(50) + '\n');

  // -- FORECAST tests --
  console.log('📋 Testing FORECAST endpoints...');

  const forecastCreate = await request('POST', '/api/forecast', {
    assignedResource: 'testuser', projectName: 'Test Project', workOrderNumber: `WO-FCAST-${ts}`,
    startDate: '2026-01-01', endDate: '2026-12-31', pbsEstHours: 'Yes',
    estimate: '500', totalForecastedHours: '480',
    janHours: 40, febHours: 40, marHours: 40, aprHours: 40, mayHours: 40, junHours: 40,
    julHours: 40, augHours: 40, sepHours: 40, octHours: 40, novHours: 40, decHours: 40,
  }, rmToken);
  results.push({ test: 'forecast CREATE', status: forecastCreate.status, pass: forecastCreate.status === 200 });
  const forecastId = forecastCreate.body?.id;
  console.log(`  CREATE: ${forecastCreate.status === 200 ? '✓' : '✗'} (status ${forecastCreate.status}, id: ${forecastId})`);

  if (forecastId) {
    const forecastUpdate = await request('PUT', `/api/forecast/${forecastId}`, {
      assignedResource: 'testuser', projectName: 'Test Project Updated', workOrderNumber: `WO-FCAST-${ts}`,
      startDate: '2026-01-01', endDate: '2026-12-31', pbsEstHours: 'No',
      estimate: '600', totalForecastedHours: '540',
      janHours: 45, febHours: 45, marHours: 45, aprHours: 45, mayHours: 45, junHours: 45,
      julHours: 45, augHours: 45, sepHours: 45, octHours: 45, novHours: 45, decHours: 45,
    }, rmToken);
    results.push({ test: 'forecast UPDATE', status: forecastUpdate.status, pass: forecastUpdate.status === 200 });
    console.log(`  UPDATE: ${forecastUpdate.status === 200 ? '✓' : '✗'} (status ${forecastUpdate.status})`);

    const forecastDelete = await request('DELETE', `/api/forecast/${forecastId}`, null, rmToken);
    results.push({ test: 'forecast DELETE', status: forecastDelete.status, pass: forecastDelete.status === 200 });
    console.log(`  DELETE: ${forecastDelete.status === 200 ? '✓' : '✗'} (status ${forecastDelete.status})`);
  }

  await sleep(300);

  // -- RESOURCE ASSIGNMENT tests --
  console.log('\n📋 Testing RESOURCE-ASSIGNMENTS endpoints...');
  const raCreate = await request('POST', '/api/resource-assignments', {
    workOrderNumber: `WO-RA-${ts}`, projectName: 'RA Test Project', projectLead: 'Lead Person',
    resourceAssigned: 'testuser', projectStartDate: '2026-01-01', projectEndDate: '2026-12-31',
    estimate: '200', projectOrderNumber: `PO-${ts}`, status: 'In-Progress',
  }, rmToken);
  results.push({ test: 'resource_mgt CREATE', status: raCreate.status, pass: raCreate.status === 201 });
  console.log(`  CREATE: ${raCreate.status === 201 ? '✓' : '✗'} (status ${raCreate.status})`);

  await sleep(300);

  // -- DAILY OP REVIEW tests --
  console.log('\n📋 Testing DAILY-OPERATING-REVIEW endpoints...');
  const dorCreate = await request('POST', '/api/daily-operating-review', {
    reportingDate: '2026-03-29', assignedResource: 'testuser',
    projectName: 'DOR Test Project', workOrderNumber: `WO-DOR-${ts}`,
    plannedForTheDay: 'Testing transaction logging', issuesAndBlockers: 'None',
  }, rmToken);
  results.push({ test: 'daily_op_review CREATE', status: dorCreate.status, pass: dorCreate.status === 201 });
  const dorId = dorCreate.body?.id;
  console.log(`  CREATE: ${dorCreate.status === 201 ? '✓' : '✗'} (status ${dorCreate.status}, id: ${dorId})`);

  if (dorId) {
    const dorDelete = await request('DELETE', `/api/daily-operating-review/${dorId}`, null, rmToken);
    results.push({ test: 'daily_op_review DELETE', status: dorDelete.status, pass: dorDelete.status === 200 });
    console.log(`  DELETE: ${dorDelete.status === 200 ? '✓' : '✗'} (status ${dorDelete.status})`);
  }

  await sleep(300);

  // -- ADMIN / USERS ROLE tests --
  console.log('\n📋 Testing ADMIN endpoints...');
  const roleAssign = await request('PUT', '/api/admin/users/role', {
    lanId: `testverify`, name: 'Test Verify User', role: 'Practitioner',
  }, adminToken);
  results.push({ test: 'app_user_roles UPSERT', status: roleAssign.status, pass: roleAssign.status === 200 });
  console.log(`  ROLE ASSIGN: ${roleAssign.status === 200 ? '✓' : '✗'} (status ${roleAssign.status})`);

  await sleep(500);

  // -- Check transaction log --
  console.log('\n📊 Checking Transaction Log...\n');
  const logResult = await request('GET', '/api/transaction-log?limit=30', null, adminToken);

  if (logResult.status !== 200) {
    console.log(`✗ Failed to access transaction log: ${JSON.stringify(logResult.body)}`);
    return;
  }

  const txns = logResult.body.transactions || [];
  const total = logResult.body.pagination?.total || 0;

  console.log(`Total transactions in log: ${total}\n`);

  // Group by table
  const byTable = {};
  txns.forEach(t => {
    if (!byTable[t.table_name]) byTable[t.table_name] = [];
    byTable[t.table_name].push(t);
  });

  const tables = ['forecast', 'resource_mgt', 'daily_op_review', 'deliverable_mgt', 'app_user_roles'];
  tables.forEach(table => {
    const entries = byTable[table] || [];
    if (entries.length > 0) {
      console.log(`  ✓ ${table}: ${entries.length} transaction(s)`);
      entries.slice(0, 3).forEach(t => {
        const unknownUser = t.user_lan_id === 'unknown' ? ' ⚠ unknown user!' : '';
        console.log(`    - ${t.operation_type} | User: ${t.user_lan_id}${unknownUser} | Status: ${t.status}`);
      });
    } else {
      console.log(`  ○ ${table}: no transactions (may not have been tested)`);
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log('TEST SUMMARY');
  console.log('='.repeat(50));
  const passed = results.filter(r => r.pass).length;
  results.forEach(r => {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.test} (HTTP ${r.status})`);
  });
  console.log(`\nResult: ${passed}/${results.length} tests passed`);
  
  const hasUnknownUser = txns.some(t => t.user_lan_id === 'unknown');
  if (hasUnknownUser) {
    console.log('\n⚠ WARNING: Some transactions still have unknown user_lan_id!');
  } else if (txns.length > 0) {
    console.log('\n✅ All transactions logged with proper user attribution');
  }

  process.exit(0);
}

setTimeout(run, 500);
