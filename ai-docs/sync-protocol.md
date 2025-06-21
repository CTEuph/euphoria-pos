# Euphoria POS Sync Protocol

## Overview

The Euphoria POS sync protocol implements a three-stage synchronization system designed for offline-first operation with eventual consistency across multiple checkout lanes and cloud storage.

## Architecture

### Three Stages of Sync

1. **Local Commit** - All changes are first written to local SQLite database
2. **Peer Sync** - Changes are synchronized with other checkout lanes via WebSocket
3. **Cloud Sync** - Changes are pushed to Supabase cloud storage when internet is available

### Key Components

#### 1. Outbox Pattern

All state changes are published to an outbox table with the following structure:

```typescript
outbox {
  id: string (UUID)
  topic: string
  payload: JSON
  status: 'pending' | 'peer_ack' | 'cloud_ack'
  retryCount: number
  createdAt: Date
  terminalId: string
  peerAckedAt?: Date
  cloudAckedAt?: Date
}
```

**Message Flow:**
1. Business logic publishes messages to outbox with status `'pending'`
2. WebSocket sync sends to peers, updates status to `'peer_ack'`
3. Cloud sync sends to Supabase, updates status to `'cloud_ack'`

#### 2. Inbox Processing

To prevent duplicate message processing:

```typescript
inbox_processed {
  messageId: string (PK)
  fromTerminal: string
  topic: string
  payload: JSON
  processedAt: Date
}
```

Each incoming message is checked against this table before processing.

#### 3. Message Topics

- `transaction` - Complete sale transactions
- `inventory` - Stock level changes
- `customer` - Customer data updates
- `employee` - Employee data changes
- `inventory.reconciliation.request` - Request inventory snapshot
- `inventory.reconciliation.complete` - Reconciliation completed

### WebSocket Protocol

#### Connection Management
- Each lane runs a WebSocket server on a configurable port (default: 8123)
- Lanes connect to peer terminals specified in configuration
- Automatic reconnection with exponential backoff

#### Message Format

**Outgoing Message:**
```json
{
  "id": "message-uuid",
  "fromTerminal": "L1",
  "topic": "inventory",
  "payload": { ... },
  "timestamp": "2024-01-01T10:00:00Z"
}
```

**Acknowledgment:**
```json
{
  "type": "ack",
  "messageId": "message-uuid"
}
```

**Inventory Request:**
```json
{
  "type": "inventory_request",
  "requestId": "req-123",
  "timestamp": "2024-01-01T10:00:00Z"
}
```

**Inventory Response:**
```json
{
  "type": "inventory_response",
  "requestId": "req-123",
  "inventory": [
    {
      "productId": "SKU123",
      "currentStock": 100,
      "reservedStock": 0,
      "lastUpdated": "2024-01-01T09:00:00Z"
    }
  ],
  "timestamp": "2024-01-01T10:00:00Z"
}
```

### Inventory Reconciliation

#### Scheduled Reconciliation
- Runs every 10 minutes
- Initial reconciliation 30 seconds after startup
- Compares inventory checksums between lanes

#### Reconciliation Process
1. Calculate SHA256 checksum of local inventory
2. Request inventory snapshots from all connected peers
3. Compare inventories and identify differences
4. Apply updates based on `lastUpdated` timestamp (newest wins)
5. Publish reconciliation events to outbox

#### Conflict Resolution
- **Last Write Wins**: The inventory record with the most recent `lastUpdated` timestamp takes precedence
- All changes create audit trail entries in `inventory_changes` table
- Reconciliation events are published for visibility

### Cloud Sync Protocol

#### Supabase Integration
- Batch processing of `peer_ack` messages every 30 seconds
- Messages sent to Supabase Edge Function endpoint
- Service key authentication required

#### Edge Function Endpoint
```
POST https://{supabase_url}/functions/v1/sync-pos-message
```

**Request Body:**
```json
{
  "messageId": "uuid",
  "terminalId": "L1",
  "topic": "transaction",
  "data": { ... },
  "timestamp": "2024-01-01T10:00:00Z",
  "peerAckedAt": "2024-01-01T10:00:05Z"
}
```

### Error Handling

#### Retry Logic
- Exponential backoff for failed sync attempts
- Maximum retry count configurable (default: 3)
- Failed messages remain in outbox for manual intervention

#### Network Failures
- Peer sync continues when internet is down
- Cloud sync automatically resumes when connection restored
- No data loss due to persistent outbox

### Security Considerations

1. **Authentication**: Employee PIN verification required for all transactions
2. **Message Integrity**: All messages include terminal ID and timestamp
3. **Idempotency**: UUID primary keys prevent duplicate processing
4. **Audit Trail**: Complete history maintained in local database

### Performance Optimizations

1. **Batch Processing**: Messages sent in batches to reduce overhead
2. **Connection Pooling**: WebSocket connections maintained for efficiency
3. **Database Indexes**: Optimized queries on outbox status and timestamps
4. **WAL Mode**: SQLite Write-Ahead Logging for concurrent access

### Monitoring

#### Sync Status Indicators
- `pending` - Message created, not yet synced
- `peer_ack` - At least one peer has received the message
- `cloud_ack` - Message successfully stored in cloud

#### Health Checks
- WebSocket connection status
- Outbox queue size
- Last successful sync timestamp
- Reconciliation status

### Configuration

Required environment variables or settings.local.json:

```json
{
  "terminalId": "L1",
  "terminalPort": 8123,
  "peerTerminals": ["ws://localhost:8124"],
  "supabaseUrl": "https://xxx.supabase.co",
  "supabaseServiceKey": "eyJ..."
}
```

### Future Enhancements

1. **Compression**: Gzip message payloads for reduced bandwidth
2. **Encryption**: End-to-end encryption for sensitive data
3. **Selective Sync**: Sync only changed fields to reduce payload size
4. **Priority Queues**: High-priority messages (payments) sync first
5. **Conflict UI**: User interface for manual conflict resolution