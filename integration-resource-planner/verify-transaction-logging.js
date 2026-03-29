/**
 * Verify that transactions are being logged with proper user attribution
 */

const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'aeaf3576254785a2f2e886104df6583972253a8aecb1e35ad8badc972ab26eacc4b25bbde82ce102d0141cfbe2876147';

// Create admin token
const adminToken = jwt.sign({ sAMAccountName: 'admin', appRole: 'Admin' }, JWT_SECRET, { expiresIn: '1h' });

// Test transaction log endpoint with admin token
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/transaction-log?limit=10',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('Full API Response:');
      console.log(JSON.stringify(result, null, 2));
      console.log('\n✓ Transaction Log Verification\n');
      console.log('==============================\n');
      console.log(`Status: ${result.status}`);
      console.log(`Error: ${result.message || 'N/A'}`);
      console.log(`Total transactions: ${result.pagination?.total || 0}`);
      console.log(`Current page: ${result.pagination?.page || 1}`);
      
      if (result.status === 'error') {
        console.log('\n❌ API Error:');
        console.log(`Message: ${result.message}`);
        return;
      }
      
      if (result.transactions && result.transactions.length > 0) {
        console.log(`\nShowing latest ${result.transactions.length} transactions:\n`);
        
        result.transactions.forEach((t, i) => {
          console.log(`[${i+1}] ${t.operation_type} on table '${t.table_name}'`);
          console.log(`    User: ${t.user_lan_id}`);
          console.log(`    Record ID: ${t.record_id}`);
          console.log(`    Status: ${t.status}`);
          console.log(`    Timestamp: ${t.operation_timestamp}`);
          
          if (t.user_lan_id === 'unknown') {
            console.log('    ⚠ WARNING: userLanId is "unknown" - user attribution not working!');
          } else {
            console.log('    ✓ User properly attributed');
          }
          console.log();
        });
        
        // Check if any recent transactions have user_lan_id != 'unknown'
        const hasProperAttribution = result.transactions.some(t => t.user_lan_id !== 'unknown');
        
        console.log('RESULT:');
        console.log('=======');
        if (hasProperAttribution) {
          console.log('✓ Transaction logging is WORKING correctly');
          console.log('✓ User attribution is PROPERLY IMPLEMENTED');
          console.log('✓ Transactions are being recorded with actual user LAN IDs');
        } else {
          console.log('✗ Transaction logging may have issues');
          console.log('✗ User attribution still showing "unknown"');
        }
      } else {
        console.log('\n⚠ No transactions found in the log');
        console.log('This might mean:');
        console.log('1. No CRUD operations have been performed since table creation');
        console.log('2. Transactions are being logged elsewhere');
        console.log('3. There is an issue with the logging mechanism');
      }
    } catch (err) {
      console.error('Error parsing response:', err.message);
    }
    
    process.exit(0);
  });
});

req.on('error', err => {
  console.error('Connection error:', err.message);
  console.error('Make sure the API server is running on port 3000');
  process.exit(1);
});

req.end();
