const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const defaultWriterHost =
  'ei-aurora-mysql-cluster.cluster-c5nm0uftpga4.us-west-2.rds.amazonaws.com';
const defaultReaderHost =
  'ei-aurora-mysql-cluster.cluster-ro-c5nm0uftpga4.us-west-2.rds.amazonaws.com';

const writerHost = process.env.DB_WRITER_HOST || process.env.DB_HOST || defaultWriterHost;
const readerHost = process.env.DB_READER_HOST || process.env.DB_HOST || defaultReaderHost;

function resolveSslConfig(hostname) {
  const rawSslValue = String(process.env.DB_SSL || '').trim().toLowerCase();

  if (['0', 'false', 'off', 'disabled', 'no'].includes(rawSslValue)) {
    return undefined;
  }

  if (['1', 'true', 'on', 'enabled', 'yes', 'required'].includes(rawSslValue)) {
    return { rejectUnauthorized: false };
  }

  // Default to SSL for managed RDS hosts; local/self-hosted DBs usually do not require it.
  return hostname.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : undefined;
}

const sharedConfig = {
  port: Number(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'ei_support',
  user: process.env.DB_USER || 'ei_support',
  password: process.env.DB_PASS || 'eisupport1234',
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || '15000'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

const writerSsl = resolveSslConfig(writerHost);
const readerSsl = resolveSslConfig(readerHost);

const writerPool = mysql.createPool({
  host: writerHost,
  ...sharedConfig,
  ...(writerSsl ? { ssl: writerSsl } : {}),
});

const readerPool = mysql.createPool({
  host: readerHost,
  ...sharedConfig,
  ...(readerSsl ? { ssl: readerSsl } : {}),
});

async function checkWriterConnection() {
  const [rows] = await writerPool.query('SELECT 1 AS ok');
  return rows;
}

async function checkReaderConnection() {
  const [rows] = await readerPool.query('SELECT 1 AS ok');
  return rows;
}

let customerColumnCache;

async function resolveCustomerColumnName() {
  if (customerColumnCache !== undefined) {
    return customerColumnCache;
  }

  const dbName = process.env.DB_NAME || 'ei_support';
  const candidateColumns = [
    'customer',
    'customer_name',
    'customer_nm',
    'customer_id',
    'customerid',
    'account_name',
  ];

  const placeholders = candidateColumns.map(() => '?').join(', ');
  const [rows] = await readerPool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'tickets'
       AND column_name IN (${placeholders})`,
    [dbName, ...candidateColumns]
  );

  const availableColumns = new Set(rows.map((row) => row.column_name));
  customerColumnCache =
    candidateColumns.find((columnName) => availableColumns.has(columnName)) || null;

  return customerColumnCache;
}

async function findTicketIds(startsWith) {
  const normalizedPrefix = `${startsWith || ''}%`;
  const customerColumn = await resolveCustomerColumnName();
  const customerSelect = customerColumn
    ? `CAST(${customerColumn} AS CHAR) AS customer`
    : `'' AS customer`;

  const [rows] = await readerPool.query(
    `SELECT
       CAST(ticket_id AS CHAR) AS ticketId,
       ${customerSelect}
     FROM tickets
     WHERE CAST(ticket_id AS CHAR) LIKE ?
     ORDER BY ticket_id
     LIMIT 10`,
    [normalizedPrefix]
  );

  return rows.map((row) => ({
    ticketId: row.ticketId,
    customer: row.customer || '',
  }));
}

module.exports = {
  writerPool,
  readerPool,
  checkWriterConnection,
  checkReaderConnection,
  findTicketIds,
};