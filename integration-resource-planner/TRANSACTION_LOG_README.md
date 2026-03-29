# Transaction Log System

## Overview

The transaction log system is a comprehensive audit trail that captures all CRUD (Create, Read, Update, Delete) operations performed on database tables throughout the Integration Resource Planner application. This system enables tracking of:

- **What** changes were made
- **Who** made the changes (user's LAN ID)
- **When** the changes occurred (timestamp)
- **Which** table and record were affected
- **Previous and new values** for update operations
- **Operation status** (success/failure)
- **IP address** and user agent of the requester

## Setup

### 1. Create the Transaction Log Table

Run the following command to create the `transaction_log` table in your database:

```bash
npm run create-transaction-log-table 2>/dev/null || node server/create-transaction-log-table.js
```

Or add the script to `package.json`:

```json
{
  "scripts": {
    "create-transaction-log-table": "node server/create-transaction-log-table.js"
  }
}
```

### 2. Verify Table Creation

Once created, the transaction log table will automatically start capturing all CRUD operations on the following tables:

- `resource_mgt` - Resource Management records
- `daily_op_review` - Daily Operating Review entries
- `users` - User management records (Admin-only operations)

## Table Schema

```sql
CREATE TABLE transaction_log (
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
```

## API Endpoints

All transaction log endpoints require Admin role authorization.

### 1. Get Transaction Log (Paginated)

**Endpoint:** `GET /api/transaction-log`

**Query Parameters:**
- `page` (optional, default: 1) - Page number for pagination
- `limit` (optional, default: 50, max: 500) - Results per page
- `tableName` (optional) - Filter by table name (e.g., 'resource_mgt', 'daily_op_review', 'users')
- `operationType` (optional) - Filter by operation type (CREATE, READ, UPDATE, DELETE)
- `userLanId` (optional) - Filter by user's LAN ID
- `startDate` (optional) - Start date for filtering (YYYY-MM-DD format)
- `endDate` (optional) - End date for filtering (YYYY-MM-DD format)

**Response:**
```json
{
  "status": "ok",
  "transactions": [
    {
      "transaction_id": 1,
      "table_name": "resource_mgt",
      "operation_type": "CREATE",
      "record_id": "42",
      "user_lan_id": "LXDG",
      "operation_timestamp": "2026-03-28 14:30:45",
      "status": "success",
      "previous_values": null,
      "new_values": {
        "work_order_number": "WO-001",
        "project_name": "Project Alpha",
        "resource_assigned": "John Doe",
        "status": "In-Progress"
      },
      "error_message": null,
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 245,
    "pages": 5
  }
}
```

### 2. Get Transaction Log Summary

**Endpoint:** `GET /api/transaction-log/summary`

**Query Parameters:**
- `days` (optional, default: 7) - Number of days to look back (1-365)

**Response:**
```json
{
  "status": "ok",
  "summary": {
    "byOperation": [
      {
        "operation_type": "UPDATE",
        "count": 125,
        "success_count": 123,
        "failure_count": 2
      },
      {
        "operation_type": "CREATE",
        "count": 42,
        "success_count": 42,
        "failure_count": 0
      },
      {
        "operation_type": "DELETE",
        "count": 8,
        "success_count": 8,
        "failure_count": 0
      }
    ],
    "byTable": [
      {
        "table_name": "resource_mgt",
        "count": 98,
        "success_count": 97,
        "failure_count": 1
      },
      {
        "table_name": "daily_op_review",
        "count": 72,
        "success_count": 72,
        "failure_count": 0
      }
    ],
    "byUser": [
      {
        "user_lan_id": "LXDG",
        "count": 85,
        "success_count": 84,
        "failure_count": 1
      },
      {
        "user_lan_id": "JSMITH",
        "count": 60,
        "success_count": 60,
        "failure_count": 0
      }
    ],
    "period": "Last 7 days"
  }
}
```

### 3. Get Specific Transaction

**Endpoint:** `GET /api/transaction-log/:transactionId`

**Response:**
```json
{
  "status": "ok",
  "transaction": {
    "transaction_id": 1,
    "table_name": "resource_mgt",
    "operation_type": "UPDATE",
    "record_id": "42",
    "user_lan_id": "LXDG",
    "operation_timestamp": "2026-03-28 14:35:22",
    "status": "success",
    "previous_values": {
      "status": "Backfill Needed",
      "resource_assigned": "Jane Doe"
    },
    "new_values": {
      "status": "In-Progress",
      "resource_assigned": "John Smith"
    },
    "error_message": null,
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0..."
  }
}
```

## Tracked Operations

### Resource Management Table (`resource_mgt`)

| Operation | Endpoint | Tracked |
|-----------|----------|---------|
| Create | POST /api/resource-assignments | ✅ |
| Read | GET /api/resource-assignments | ✅ |
| Update | PUT /api/resource-assignments/:id | ✅ |
| Delete | DELETE /api/resource-assignments/:id | ✅ |

### Daily Operating Review Table (`daily_op_review`)

| Operation | Endpoint | Tracked |
|-----------|----------|---------|
| Create | POST /api/daily-operating-review | ✅ |
| Read | GET /api/daily-operating-review | ✅ |
| Update | PUT /api/daily-operating-review/:id | ✅ |
| Delete | DELETE /api/daily-operating-review/:id | ✅ |

### User Management Table (`users`)

| Operation | Endpoint | Tracked |
|-----------|----------|---------|
| Create | POST /api/admin/users | ✅ |
| Read | GET /api/admin/users | ✅ |
| Update | PUT /api/admin/users | ✅ |
| Delete | DELETE /api/admin/users/:lanId | ✅ |

## Example Usage

### View all changes made by a specific user in the last 7 days:

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/transaction-log?userLanId=LXDG&days=7"
```

### View all updates to the resource_mgt table:

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/transaction-log?tableName=resource_mgt&operationType=UPDATE"
```

### Get a summary of all operations in the last 30 days:

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/transaction-log/summary?days=30"
```

### View details of a specific transaction:

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/transaction-log/12345"
```

## Maintenance

### Purging Old Entries

To maintain database performance, you may want to periodically archive or delete old transaction log entries. Here's a suggested maintenance query:

```sql
-- Archive transactions older than 90 days (optional)
-- DELETE FROM transaction_log WHERE operation_timestamp < DATE_SUB(NOW(), INTERVAL 90 DAY);

-- Check transaction log size
SELECT 
  table_name,
  round(((data_length + index_length) / 1024 / 1024), 2) AS size_mb,
  COUNT(*) as record_count
FROM information_schema.tables t
JOIN transaction_log tl ON 1=1
WHERE table_schema = DATABASE()
  AND t.table_name = 'transaction_log'
GROUP BY table_name;
```

### Example Retention Policy

Add this as a scheduled job to run daily/weekly:

```javascript
// In production, consider using a job scheduler like node-cron
setInterval(async () => {
  try {
    await writerPool.query(
      `DELETE FROM transaction_log 
       WHERE operation_timestamp < DATE_SUB(NOW(), INTERVAL 180 DAY)`
    );
    console.log('Transaction log cleanup completed');
  } catch (error) {
    console.error('Transaction log cleanup failed:', error.message);
  }
}, 24 * 60 * 60 * 1000); // Run every 24 hours
```

## Data Privacy

The transaction log captures:
- User LAN ID (not full user details)
- Previous and new values (important for compliance and audit trails)
- IP address and user agent (for security analysis)

Be mindful that this is sensitive audit data and should be treated accordingly in terms of access control and data retention policies.

## Performance Considerations

The transaction log table includes optimal indexes for common query patterns:

- Filtering by table name
- Filtering by user
- Filtering by operation type
- Filtering by timestamp range
- Combined filtering on table name + record ID

For very large transaction logs (millions of records), consider:
1. Implementing table partitioning by date
2. Creating dedicated read replicas for transaction log queries
3. Archiving old entries to a separate audit database
4. Implementing log compression/summarization for historical data
