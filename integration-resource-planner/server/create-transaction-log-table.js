const { writerPool } = require('./db');

async function createTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS transaction_log (
      transaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      table_name VARCHAR(100) NOT NULL,
      operation_type ENUM('CREATE', 'READ', 'UPDATE', 'DELETE') NOT NULL,
      record_id VARCHAR(255) NULL,
      user_lan_id VARCHAR(100) NOT NULL,
      operation_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status ENUM('success', 'failure') NOT NULL DEFAULT 'success',
      previous_values JSON NULL,
      new_values JSON NULL,
      error_message TEXT NULL,
      ip_address VARCHAR(45) NULL,
      user_agent VARCHAR(500) NULL,
      PRIMARY KEY (transaction_id),
      INDEX idx_transaction_log_table (table_name),
      INDEX idx_transaction_log_user (user_lan_id),
      INDEX idx_transaction_log_operation (operation_type),
      INDEX idx_transaction_log_timestamp (operation_timestamp),
      INDEX idx_transaction_log_record (table_name, record_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  await writerPool.query(sql);
  console.log('transaction_log table is ready.');
}

createTable()
  .catch((error) => {
    console.error(`Failed to create transaction_log: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await writerPool.end();
  });
