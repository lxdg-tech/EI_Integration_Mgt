const { writerPool, readerPool } = require('./db');

async function addProjectOrderNumberColumn() {
  const [existing] = await readerPool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'resource_mgt'
      AND COLUMN_NAME = 'project_order_number'
    LIMIT 1
  `);

  if (existing.length > 0) {
    console.log('Column project_order_number already exists in resource_mgt.');
    return;
  }

  await writerPool.query(`
    ALTER TABLE resource_mgt
    ADD COLUMN project_order_number VARCHAR(100) NOT NULL DEFAULT ''
    AFTER estimate
  `);

  console.log('Column project_order_number added to resource_mgt.');
}

addProjectOrderNumberColumn()
  .catch((error) => {
    console.error(`Failed to add project_order_number column: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([writerPool.end(), readerPool.end()]);
  });
