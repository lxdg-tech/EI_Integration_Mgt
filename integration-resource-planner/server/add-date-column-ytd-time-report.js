const { writerPool, readerPool } = require('./db');

async function addDateColumnIfMissing() {
  const [rows] = await readerPool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'YTD_Time_Report'
       AND column_name = 'Date'
     LIMIT 1`
  );

  if (rows.length > 0) {
    console.log('YTD_Time_Report.Date already exists.');
    return;
  }

  await writerPool.query('ALTER TABLE YTD_Time_Report ADD COLUMN `Date` DATE NULL AFTER `First name`');
  console.log('Added Date column to YTD_Time_Report.');
}

addDateColumnIfMissing()
  .catch((error) => {
    console.error(`Failed to add Date column: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([writerPool.end(), readerPool.end()]);
  });
