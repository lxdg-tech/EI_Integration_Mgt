const fs = require('node:fs/promises');
const path = require('node:path');
const { writerPool } = require('./db');

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function escapeIdentifier(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function normalizeCell(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function isNumeric(value) {
  return value !== null && /^-?\d+(\.\d+)?$/.test(value);
}

async function run() {
  const csvArg = process.argv[2];
  const csvPath = csvArg
    ? path.resolve(csvArg)
    : path.resolve('C:\\Users\\lxdg\\OneDrive - PGE\\2026\\TechNotes\\EI_Resource_Mgt\\Users.csv');

  const raw = await fs.readFile(csvPath, 'utf8');
  const lines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => parseCsvLine(line));

  for (const row of rows) {
    if (row.length < headers.length) {
      while (row.length < headers.length) {
        row.push('');
      }
    }
    if (row.length > headers.length) {
      row.length = headers.length;
    }
  }

  const employmentCol = 'Employeement Number';
  const billRateCol = 'Bill Rate';

  const columnDefs = headers.map((header) => {
    if (header === employmentCol) {
      return `${escapeIdentifier(header)} BIGINT NULL`;
    }
    if (header === billRateCol) {
      return `${escapeIdentifier(header)} DECIMAL(10,2) NULL`;
    }
    return `${escapeIdentifier(header)} VARCHAR(255) NULL`;
  });

  const tableName = 'Users';
  const createSql = `CREATE TABLE IF NOT EXISTS ${escapeIdentifier(tableName)} (${columnDefs.join(', ')})`;

  const conn = await writerPool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(createSql);
    await conn.query(`TRUNCATE TABLE ${escapeIdentifier(tableName)}`);

    const columnsSql = headers.map(escapeIdentifier).join(', ');
    const rowPlaceholder = `(${headers.map(() => '?').join(', ')})`;

    const batchSize = 200;
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      const placeholders = batch.map(() => rowPlaceholder).join(', ');
      const values = [];

      for (const row of batch) {
        for (let i = 0; i < headers.length; i += 1) {
          const header = headers[i];
          const cell = normalizeCell(row[i]);

          if (header === employmentCol) {
            values.push(isNumeric(cell) ? Number(cell) : null);
          } else if (header === billRateCol) {
            values.push(isNumeric(cell) ? Number(cell) : null);
          } else {
            values.push(cell);
          }
        }
      }

      const insertSql = `INSERT INTO ${escapeIdentifier(tableName)} (${columnsSql}) VALUES ${placeholders}`;
      await conn.query(insertSql, values);
    }

    await conn.commit();

    const [countRows] = await conn.query(`SELECT COUNT(*) AS rowCount FROM ${escapeIdentifier(tableName)}`);
    console.log(`Imported ${countRows[0].rowCount} rows into table ${tableName}.`);
    console.log(`CSV source: ${csvPath}`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
    await writerPool.end();
  }
}

run().catch((error) => {
  console.error('Import failed:', error.message || error);
  process.exitCode = 1;
});
