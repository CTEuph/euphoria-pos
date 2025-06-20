# Next Steps for Offline Auth & Sync Implementation

## Current Status
- ✅ Basic IPC communication working
- ✅ Preload script loading correctly
- ✅ Mock auth verification working
- ❌ SQLite database not initialized
- ❌ Real employee data not available
- ❌ Sync services not running

## Immediate Tasks

### 1. Fix SQLite Database Initialization
The Drizzle ORM schema import is failing. The error suggests an issue with how the schema is being imported.

**Action Items:**
```typescript
// In electron/services/localDb.ts
// Current (broken):
export const db = drizzle(sqlite, { schema })

// Try instead:
export const db = drizzle(sqlite)
// Then import tables individually when needed
```

**Test by:**
- Re-enable `initializeDatabase()` in main.ts
- Check if database file is created at `~/Library/Application Support/euphoria-pos/pos.sqlite`
- Run the test script: `node test-db.mjs`

### 2. Fix Schema Imports
The SQLite schema has circular dependencies or ES module issues.

**Action Items:**
- Check if the schema file is using correct imports for SQLite
- Ensure no circular dependencies between relations
- Consider splitting schema into separate files if needed
- Make sure to use CommonJS exports if necessary

### 3. Re-enable Employee Service
Once database works, re-enable real PIN verification.

**Action Items:**
- Uncomment `seedEmployees()` in main.ts
- Test with PINs: 1234, 5678, 9999
- Verify bcrypt hashing works in Electron environment

### 4. Test Complete Auth Flow
- Implement proper login screen (not just test component)
- Add logout functionality
- Add session persistence
- Test "Get Current Employee" functionality

### 5. Enable Sync Services
After auth works completely:
- Re-enable `validateConfig()` 
- Create `.env` file from `.env.example`
- Re-enable `startLaneSync()` and `startCloudSync()`
- Test WebSocket communication between lanes

## Important Configuration Notes

### Preload Script
The preload script now outputs as CommonJS (`.js`) not ES modules (`.mjs`). Any future modifications must use:
```javascript
const { something } = require('module')
// NOT: import { something } from 'module'
```

### Environment Variables
Create `.env` file with:
```
TERMINAL_ID=L1
TERMINAL_PORT=8123
PEER_TERMINALS=ws://192.168.1.42:8123
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=xxxxxxxx
SYNC_BACKOFF_BASE_MS=2000
```

### Native Modules
Always run `npm run postinstall` after installing new packages to rebuild native modules for Electron.

## Testing Checklist

1. **Database Creation**
   ```bash
   ls -la ~/Library/Application\ Support/euphoria-pos/pos.sqlite
   ```

2. **Employee Seeding**
   ```bash
   node test-db.mjs
   # Should show 3 employees
   ```

3. **Auth Flow**
   - Login with PIN 1234
   - Check current employee
   - Logout
   - Try invalid PIN

4. **Sync Testing**
   - Start two instances on different ports
   - Create transaction on one
   - Verify it appears on the other

## Known Issues to Fix

1. **Drizzle Schema Import Error**
   - Error: `Cannot read properties of null (reading 'constructor')`
   - Happens when passing schema object to drizzle()
   - May need to upgrade Drizzle or change import strategy

2. **Better Error Handling**
   - Add proper error messages for database failures
   - Add fallback for when sync services fail
   - Add retry logic for database initialization

3. **Security Considerations**
   - Ensure `.env` is in `.gitignore`
   - Don't commit `settings.local.json`
   - Consider encrypting SQLite database

## Code Cleanup Tasks

1. Remove test files:
   - `test-db.js`
   - `test-db.mjs`
   - `electron/preload-test.ts`

2. Remove `TestAuth` component from App.tsx

3. Uncomment all disabled services in main.ts

4. Replace mock auth with real database queries

## Success Criteria

The implementation is complete when:
- [ ] Employees can login offline with PINs
- [ ] Database persists between app restarts
- [ ] Two lanes can sync transactions in real-time
- [ ] Sync continues working when internet is disconnected
- [ ] All tests pass without mock data