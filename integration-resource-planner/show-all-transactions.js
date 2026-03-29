const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'aeaf3576254785a2f2e886104df6583972253a8aecb1e35ad8badc972ab26eacc4b25bbde82ce102d0141cfbe2876147';
const adminToken = jwt.sign({ sAMAccountName: 'admin', appRole: 'Admin' }, JWT_SECRET, { expiresIn: '1h' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/transaction-log?limit=20',
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
      console.log('📋 Complete Transaction Log');
      console.log('==========================\n');
      console.log(`Total transactions: ${result.pagination.total}\n`);
      
      if (result.transactions.length > 0) {
        console.log('Transactions Found:');
        result.transactions.forEach((t, i) => {
          console.log(`[${i+1}] ${t.operation_type} - ${t.table_name} (ID: ${t.record_id})`);
          console.log(`    User: ${t.user_lan_id} | Status: ${t.status}`);
          console.log(`    Time: ${t.operation_timestamp}`);
        });
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
    process.exit(0);
  });
});

req.on('error', err => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

req.end();
