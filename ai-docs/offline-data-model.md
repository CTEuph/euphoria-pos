# Offline Data Model

## Overview

The Euphoria POS uses a local-first architecture with SQLite as the primary data store on each terminal. This ensures the POS can operate fully offline while maintaining eventual consistency across lanes and with the cloud.

## Why Local SQLite?

1. **Zero Network Dependency**: Complete sales even during internet outages
2. **Sub-100ms Operations**: All queries run locally
3. **ACID Guarantees**: Transactions never lost due to crashes
4. **Simple Deployment**: No separate database server required

## Data Scope

### Local-Only Data
- Active transactions in progress
- Temporary UI state
- Hardware device connections

### Locally Cached & Synced Data
- **Products & Inventory**: Full catalog with real-time stock levels
- **Employees**: All staff with permissions and PIN hashes
- **Customers**: Loyalty members with point balances
- **Discount Rules**: Case discounts, employee pricing
- **Business Configuration**: Tax rates, loyalty multipliers
- **Transaction History**: Last 90 days for returns/reports

### Cloud-Only Data (Never Local)
- Payment gateway credentials
- Detailed analytics/reports
- Historical data > 90 days
- Supplier information

## Entity Relationship Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Products   │────<│ProductBarcodes│     │  Inventory  │
└─────────────┘     └──────────────┘     └─────────────┘
       │                                         │
       │                                         │
       v                                         v
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│Transaction  │────<│TransactionItem│────>│InventoryChg│
│   Items     │     └──────────────┘     │   (Audit)   │
└─────────────┘                          └─────────────┘
       │
       v
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│Transactions │────<│   Payments   │     │  Customers  │
└─────────────┘     └──────────────┘     └─────────────┘
       │
       v
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Employees  │     │  PosConfig   │     │DiscountRules│
└─────────────┘     └──────────────┘     └─────────────┘

Sync Infrastructure:
┌─────────────┐     ┌──────────────┐
│   Outbox    │     │InboxProcessed│
└─────────────┘     └──────────────┘
```

## Key Design Decisions

### 1. Tax & Business Rules Stored Locally
**Why**: POS must calculate totals offline
**Example**: 
```json
// pos_config table
{
  "key": "tax_rate",
  "value": { "percent": 8.0 }
}
```

### 2. Inventory as Authoritative Local Copy
**Why**: Real-time stock critical for wine/liquor compliance
**Sync**: Bi-directional with conflict detection
**Audit**: Every change logged with employee & terminal ID

### 3. PIN Hashes, Not Passwords
**Why**: Offline authentication without security risk
**Implementation**: bcrypt with cost factor 10
**Never Synced**: PINs hashed locally on each terminal

### 4. Outbox Pattern for Reliability
**Why**: Guarantees no lost transactions
**Flow**: 
1. Business operation in transaction
2. Insert outbox message in same transaction
3. Background worker handles delivery/retry

### 5. UUID Primary Keys
**Why**: Conflict-free ID generation across lanes
**Format**: UUID v4 for all entities
**Benefits**: No sequence coordination needed

## Security Model

### Data at Rest
- **Location**: `~/Library/Application Support/euphoria-pos/pos.sqlite`
- **Permissions**: User-only read/write (macOS default)
- **Encryption**: Optional SQLCipher support (future)

### Sensitive Data Isolation
```
┌─────────────────────────┐
│     OS Keychain         │
├─────────────────────────┤
│ • Supabase Service Key  │
│ • Payment Gateway Keys  │
│ • API Credentials       │
└─────────────────────────┘

┌─────────────────────────┐
│    SQLite Database      │
├─────────────────────────┤
│ • Business Data         │
│ • PIN Hashes            │
│ • Transaction History   │
└─────────────────────────┘

┌─────────────────────────┐
│    Never Stored         │
├─────────────────────────┤
│ • Plain Text PINs       │
│ • Card Numbers          │
│ • CVV Codes            │
└─────────────────────────┘
```

## Sync Boundaries

### Immediate Sync (< 5 seconds)
- Inventory changes
- New transactions
- Employee updates

### Batched Sync (Cloud push)
- Aggregated at 5-second intervals
- Retry with exponential backoff
- Preserves order within terminal

### Pull-Based Updates
- Product catalog changes
- Discount rule updates
- Configuration changes
- Initiated by cloud webhooks or polling

## Data Retention

### Local SQLite
- **Transactions**: 90 days
- **Inventory Changes**: 30 days  
- **Outbox Messages**: 30 days after cloud ACK
- **Products/Employees**: No expiration

### Cleanup Schedule
- Daily at 3 AM local time
- Removes acknowledged outbox messages
- Archives old transactions to cloud
- Vacuums database for performance