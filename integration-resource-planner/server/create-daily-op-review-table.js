const { writerPool } = require('./db');

async function createTable() {
  const sql = `
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
  `;

  await writerPool.query(sql);
  console.log('daily_op_review table is ready.');
}

createTable()
  .catch((error) => {
    console.error(`Failed to create daily_op_review: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await writerPool.end();
  });
