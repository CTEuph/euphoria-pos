# Sync Protocol Documentation

## Overview

The Euphoria POS uses a multi-layer sync architecture to ensure data consistency across lanes and with the cloud. The system implements an outbox pattern for reliable message delivery and supports both peer-to-peer lane sync and cloud synchronization.

## Message Types

- `transaction:new` - New transaction created
- `inventory:update` - Inventory level changed
- `employee:upsert` - Employee added or updated
- `product:upsert` - Product added or updated
- `product:bulk_upsert` - Multiple products updated
- `discount_rule:upsert` - Discount rule added or updated
- `pos_config:update` - Configuration value changed
- `inventory:checksum` - Inventory reconciliation checksum

## JSON Envelope Format

All sync messages follow this structure:

```json
{
  "id": "uuid-v4",
  "topic": "message-type",
  "payload": { /* message-specific data */ },
  "origin": "terminal-id",
  "ts": "2024-01-01T00:00:00.000Z"
}
```

## Acknowledgment Rules

1. **Peer Acknowledgment**: When a lane receives a message, it immediately sends:
   ```json
   { "ack": "message-uuid" }
   ```

2. **Status Progression**:
   - `pending` → Initial state
   - `peer_ack` → Acknowledged by peer lane
   - `cloud_ack` → Acknowledged by cloud
   - `error` → Max retries exceeded

## Retry Strategy

- **Base backoff**: 2000ms (configurable via `SYNC_BACKOFF_BASE_MS`)
- **Exponential backoff**: `base * 2^retries`
- **Max retries**: 10
- **Jitter**: Random factor 0-3 for reconnection backoff

## Lane-to-Lane WebSocket Protocol

### Server (Port 8123 default)
- Accepts incoming connections from peer lanes
- Processes messages in SQLite transactions
- Prevents duplicate processing via `inbox_processed` table
- Sends acknowledgments after successful processing

### Client
- Connects to all configured peer terminals
- Polls outbox every 200ms for pending messages
- Maintains per-peer acknowledgment tracking
- Automatic reconnection with exponential backoff

## Cloud Sync Protocol

### Edge Function Endpoints
- `/functions/v1/ingest/transaction`
- `/functions/v1/ingest/inventory`
- `/functions/v1/ingest/employee`
- `/functions/v1/ingest/product`
- `/functions/v1/ingest/config`
- `/functions/v1/ingest/discount`

### Headers
- `Authorization: Bearer {SUPABASE_SERVICE_KEY}`
- `Content-Type: application/json`
- `x-terminal-id: {TERMINAL_ID}`

### Response Codes
- `200 OK` - Message processed successfully
- `400 Bad Request` - Invalid message format
- `401 Unauthorized` - Invalid API key
- `409 Conflict` - Duplicate message (safe to ignore)
- `500 Internal Server Error` - Retry with backoff

## Reconciliation Protocol

### Scheduled Checksum Comparison (Every 10 minutes)
1. Calculate inventory checksum: `count|totalChange`
2. Publish `inventory:checksum` message to peers
3. Compare checksums when received
4. Request detailed records on mismatch

### Checksum Calculation
```sql
SELECT 
  COUNT(*) as count,
  SUM(change_amount) as totalChange
FROM inventory_changes
WHERE created_at >= (NOW() - INTERVAL '24 hours')
```

## Conflict Resolution

### Inventory Conflicts
- Both changes applied in timestamp order
- Negative stock flagged for manager review
- Audit trail maintained in `inventory_changes`

### Configuration Conflicts
- Cloud always wins for business settings
- Local timestamp preserved if newer (marked for review)

### Employee/Product Updates
- Last-write-wins based on `updatedAt` timestamp
- Full object replacement (no field merging)

## Security Considerations

1. **Authentication**: All IPC handlers require active employee session
2. **Authorization**: Manager-only operations checked at service level
3. **Data Isolation**: Each terminal has separate SQLite database
4. **Message Integrity**: UUID prevents replay attacks
5. **Network Security**: TLS recommended for production WebSocket connections

## Performance Optimizations

1. **Batch Processing**: Multiple messages sent in single WebSocket frame
2. **Connection Pooling**: Persistent WebSocket connections between lanes
3. **Indexed Queries**: Outbox status and timestamp indexes
4. **WAL Mode**: SQLite Write-Ahead Logging for concurrent access
5. **Cleanup Job**: Old acknowledged messages purged after 30 days