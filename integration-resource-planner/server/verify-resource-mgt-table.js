const { readerPool } = require('./db');

async function verifyTable() {
  const [rows] = await readerPool.query("SHOW TABLES LIKE 'resource_mgt'");
  if (rows.length > 0) {
    console.log('resource_mgt table exists.');
  } else {
    console.log('resource_mgt table was not found.');
    process.exitCode = 1;
  }
}

verifyTable()
  .catch((error) => {
    console.error(`Failed to verify resource_mgt: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await readerPool.end();
  });
