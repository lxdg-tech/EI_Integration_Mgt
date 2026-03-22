const { writerPool } = require('./db');

async function migrateForecastTable() {
  const [columnRows] = await writerPool.query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'forecast'
       AND column_name = 'calendar_year'`
  );

  const hasCalendarYear = columnRows.length > 0;

  if (hasCalendarYear) {
    try {
      await writerPool.query('ALTER TABLE forecast DROP INDEX uq_forecast_entry');
    } catch (error) {
      if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && error?.code !== 'ER_DROP_INDEX_FK') {
        throw error;
      }
    }

    try {
      await writerPool.query('ALTER TABLE forecast DROP INDEX idx_forecast_calendar_year');
    } catch (error) {
      if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && error?.code !== 'ER_DROP_INDEX_FK') {
        throw error;
      }
    }

    await writerPool.query('ALTER TABLE forecast DROP COLUMN calendar_year');
  }

  try {
    await writerPool.query('ALTER TABLE forecast DROP INDEX uq_forecast_entry');
  } catch (error) {
    if (error?.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && error?.code !== 'ER_DROP_INDEX_FK') {
      throw error;
    }
  }

  await writerPool.query(
    'ALTER TABLE forecast ADD UNIQUE INDEX uq_forecast_entry (assigned_resource, project_name, work_order_number)'
  );

  console.log('forecast table migrated: calendar_year removed and unique index updated.');
}

migrateForecastTable()
  .catch((error) => {
    console.error(`Failed to migrate forecast table: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await writerPool.end();
  });
