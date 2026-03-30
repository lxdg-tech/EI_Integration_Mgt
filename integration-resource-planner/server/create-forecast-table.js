const { writerPool } = require('./db');

async function createTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS forecast (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      assigned_resource VARCHAR(255) NOT NULL,
      project_name VARCHAR(255) NOT NULL,
      work_order_number VARCHAR(100) NOT NULL,
      project_order_number VARCHAR(100) NULL,
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
  `;

  await writerPool.query(sql);
  console.log('forecast table is ready.');
}

createTable()
  .catch((error) => {
    console.error(`Failed to create forecast: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await writerPool.end();
  });
