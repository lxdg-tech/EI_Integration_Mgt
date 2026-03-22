const { writerPool } = require('./db');

async function createTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS resource_mgt (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      work_order_number VARCHAR(50) NOT NULL,
      project_lead VARCHAR(255) NOT NULL,
      resource_assigned VARCHAR(255) NOT NULL,
      project_start_date DATE NOT NULL,
      project_end_date DATE NOT NULL,
      estimate VARCHAR(255) NULL,
      project_order_number VARCHAR(100) NOT NULL,
      status ENUM('In-Progress', 'Backfill Needed', 'Complete', 'Closed') NOT NULL DEFAULT 'In-Progress',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_resource_mgt_work_order (work_order_number),
      INDEX idx_resource_mgt_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  await writerPool.query(sql);
  console.log('resource_mgt table is ready.');
}

createTable()
  .catch((error) => {
    console.error(`Failed to create resource_mgt: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await writerPool.end();
  });
