const { writerPool, readerPool } = require('./db');

async function addProjectNameColumn() {
  const [existing] = await readerPool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'resource_mgt'
      AND COLUMN_NAME = 'project_name'
    LIMIT 1
  `);

  if (existing.length > 0) {
    console.log('Column project_name already exists in resource_mgt.');
    return;
  }

  await writerPool.query(`
    ALTER TABLE resource_mgt
    ADD COLUMN project_name VARCHAR(255) NULL
    AFTER work_order_number
  `);

  console.log('Column project_name added to resource_mgt.');
}

addProjectNameColumn()
  .catch((error) => {
    console.error(`Failed to add project_name column: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([writerPool.end(), readerPool.end()]);
  });
