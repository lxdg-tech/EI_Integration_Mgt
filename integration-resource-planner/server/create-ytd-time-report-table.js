const { writerPool } = require('./db');

async function createTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS YTD_Time_Report (
      \`Personnel No.\` VARCHAR(50) NULL,
      \`Last name\` VARCHAR(255) NULL,
      \`First name\` VARCHAR(255) NULL,
      \`Date\` DATE NULL,
      \`Number (unit)\` DECIMAL(12,2) NULL,
      \`Code Text\` VARCHAR(255) NULL,
      \`Rec. order\` VARCHAR(100) NULL,
      \`Receiving Order\` VARCHAR(100) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  await writerPool.query(sql);
  console.log('YTD_Time_Report table is ready.');
}

createTable()
  .catch((error) => {
    console.error(`Failed to create YTD_Time_Report: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await writerPool.end();
  });
