# POS Sync Architecture

## Overview

The POS sync system uses a three-stage approach to ensure reliable data synchronization:

1. **Local SQLite + Outbox Pattern** - All changes are first written locally
2. **Peer-to-Peer Lane Sync** - WebSocket connections between checkout lanes
3. **Cloud Sync** - Batch upload to Supabase for central storage

## Sync Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Local Write   │────▶│  Peer-to-Peer   │────▶│   Cloud Sync    │
│   (SQLite)      │     │  (WebSocket)    │     │   (Supabase)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     pending                 peer_ack              cloud_ack
```

## Message States

- **pending** - Message written to outbox, waiting for peer sync
- **peer_ack** - At least one peer has acknowledged receipt
- **cloud_ack** - Message successfully synced to cloud

## Configuration

### Environment Variables (.env)

```bash
# Terminal Configuration
TERMINAL_ID=L1                               # Unique terminal identifier
TERMINAL_PORT=8123                          # WebSocket server port
PEER_TERMINALS=ws://localhost:8124          # Comma-separated peer URLs

# Cloud Sync Configuration
SUPABASE_URL=https://xxx.supabase.co        # Your Supabase project URL
SUPABASE_SERVICE_KEY=your_service_key_here  # Supabase service role key
SYNC_BACKOFF_BASE_MS=1000                   # Base retry delay
```

### Local Settings (electron/settings.local.json)

```json
{
  "terminalId": "L1",
  "terminalPort": 8123
}
```

## How to Connect Cloud Sync

Cloud sync is currently **NOT connected** to the main application. To enable it:

### 1. Update main.ts

```typescript
import { startCloudSync, stopCloudSync } from './services/sync'

// In app.whenReady()
app.whenReady().then(async () => {
  // ... existing code ...
  
  // Start cloud sync
  const cloudConfig = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
    terminalId: getConfig().terminalId,
    syncInterval: 30000, // 30 seconds
    batchSize: 50,
    maxRetries: 3
  }
  startCloudSync(cloudConfig)
})

// In app.on('before-quit')
app.on('before-quit', () => {
  stopCloudSync()
  // ... existing cleanup ...
})
```

### 2. Create Supabase Edge Function

Create `supabase/functions/sync-pos-message/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { messageId, terminalId, topic, data, timestamp, peerAckedAt } = await req.json()
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Process message based on topic
    switch (topic) {
      case 'transaction':
        // Insert transaction data
        await supabase.from('transactions').insert(data)
        break
        
      case 'inventory':
        // Update inventory
        await supabase.from('inventory').upsert(data)
        break
        
      case 'customer':
        // Upsert customer data
        await supabase.from('customers').upsert(data)
        break
    }
    
    // Log sync event
    await supabase.from('sync_log').insert({
      message_id: messageId,
      terminal_id: terminalId,
      topic,
      synced_at: new Date().toISOString()
    })
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
```

### 3. Deploy Edge Function

```bash
supabase functions deploy sync-pos-message
```

## Testing Cloud Sync

### Manual Test

```typescript
// In electron console or test file
import { triggerCloudSync } from './services/sync'

const config = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseServiceKey: 'your-service-key',
  terminalId: 'L1'
}

await triggerCloudSync(config)
```

### Monitoring

Check sync status:
- Outbox table: `SELECT status, COUNT(*) FROM outbox GROUP BY status`
- Sync logs: Check Supabase Edge Function logs
- Local logs: Terminal output shows sync progress

## Security Notes

1. **Service Key**: Only use service role key in Electron main process
2. **Row Level Security**: Ensure RLS policies on Supabase tables
3. **Message Validation**: Validate all incoming messages in Edge Function
4. **Idempotency**: Use message IDs to prevent duplicate processing

## Troubleshooting

### Messages stuck in 'peer_ack' state
- Check if cloud sync is running: `getCloudSyncStatus()`
- Verify Supabase credentials are correct
- Check Edge Function logs for errors

### High retry counts
- Check network connectivity
- Verify Edge Function is deployed and accessible
- Look for rate limiting or quota issues

### Sync delays
- Adjust `syncInterval` for more frequent syncing
- Increase `batchSize` for better throughput
- Check Edge Function performance metrics