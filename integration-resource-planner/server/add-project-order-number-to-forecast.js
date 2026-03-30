const { writerPool, readerPool } = require('./db');

async function addProjectOrderNumberToForecast() {
  const [existing] = await readerPool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'forecast'
      AND COLUMN_NAME = 'project_order_number'
    LIMIT 1
  `);

  if (existing.length > 0) {
    console.log('Column project_order_number already exists in forecast.');
    return;
  }

  await writerPool.query(`
    ALTER TABLE forecast
    ADD COLUMN project_order_number VARCHAR(100) NULL
    AFTER work_order_number
  `);

  console.log('Column project_order_number added to forecast.');
}

addProjectOrderNumberToForecast()
  .catch((error) => {
    console.error(`Failed to add project_order_number to forecast: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([writerPool.end(), readerPool.end()]);
  });
