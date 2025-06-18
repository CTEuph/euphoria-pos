# Euphoria POS - API & State Management Principles

## Core Architecture Principles

### 1. **Process Separation**

**Main Process (Electron) Handles:**
- All hardware communication (scanner, printer, RFID, payment terminal)
- Direct database queries (security & performance)
- File system operations
- External API calls (Zinrelo, payment processing)

**Renderer Process (React) Handles:**
- UI state and interactions
- Display logic and formatting
- User input validation
- Local state management (cart, UI preferences)

**Key Rule**: Renderer never directly touches hardware or database. Always goes through IPC.

### 2. **IPC Communication Patterns**

**Pattern 1: Commands (One-way with result)**
```typescript
// Renderer asks, Main responds
const result = await electron.{domain}.{action}(params)

// Examples:
await electron.printer.print(receipt)
await electron.database.lookupProduct(barcode)
```

**Pattern 2: Event Streams (Hardware events)**
```typescript
// Renderer subscribes to hardware events
const unsubscribe = electron.{hardware}.on{Event}(callback)

// Examples:
electron.scanner.onScan((barcode: string) => {})
electron.rfid.onCardDetected((cardId: string) => {})

// Always return unsubscribe function for cleanup
```

**Pattern 3: State Sync (Database changes)**
```typescript
// Main process notifies of external changes
electron.inventory.onStockChange((changes) => {})
electron.sync.onCloudUpdate((update) => {})
```

### 3. **Data Flow Principles**

**Barcode Scanning Flow:**
1. Scanner sends ONLY barcode to renderer
2. Renderer looks up product via IPC
3. Renderer manages cart state
4. Why: Keeps renderer in control of business logic

**Payment Flow:**
1. Renderer calculates final amount
2. Renderer sends payment request to main
3. Main handles hardware, returns result
4. Renderer updates transaction state

**Key Rule**: Renderer owns transaction state until completion, then sends full transaction to main for persistence.

### 4. **State Management Structure**

**Store Organization:**
```typescript
// Feature-based stores (not technical-based)
useCheckoutStore    // Current transaction state
useCustomerStore    // Current customer context
useTerminalStore    // Terminal config & status
useInventoryStore   // Local inventory cache
```

**State Principles:**
- Each store owns one business domain
- Stores can read from each other but avoid circular dependencies
- Heavy computations use computed values (get), not stored state
- Async operations handled via actions, not in components

**Cart State Example:**
```typescript
interface CheckoutStore {
  // State
  cart: CartItem[]
  customer: Customer | null
  payments: Payment[]
  
  // Computed (not stored)
  get subtotal(): number
  get tax(): number
  get total(): number
  get loyaltyPoints(): number
  
  // Actions
  addItem(product: Product): void
  updateQuantity(itemId: string, quantity: number): void
  applyCustomer(customer: Customer): void
  
  // Transaction completion
  completeTransaction(): Promise<Transaction>
}
```

### 5. **Error Handling Patterns**

**IPC Errors:**
- Main process returns `{ success: false, error: string }` for expected errors
- Throws exceptions only for unexpected errors
- Renderer shows user-friendly messages

**Hardware Errors:**
- Always have fallback UI for disconnected hardware
- Queue operations when offline
- Auto-retry with exponential backoff

**State Errors:**
- Never leave store in invalid state
- Use transactions: all-or-nothing updates
- Log errors but keep UI responsive

### 6. **Hardware Event Principles**

**Scanner Pattern:**
```typescript
// Main process is thin - just passes events
// Business logic stays in renderer
scanner.onScan((barcode) => {
  // Renderer decides what to do:
  // - Add to cart?
  // - Customer lookup?
  // - Gift card check?
})
```

**Payment Terminal Pattern:**
```typescript
// Stateful operations use request/response
const paymentId = await electron.payment.startTransaction(amount)
// Terminal shows amount, waits for card
const result = await electron.payment.waitForCompletion(paymentId)
```

### 7. **Database Sync Principles**

**Local-First:**
- Critical data (products, inventory) cached in renderer
- Updates applied optimistically
- Sync happens in background

**Conflict Resolution:**
- Last-write-wins for most fields
- Special handling for inventory (sum all changes)
- Transaction log for audit trail

**Offline Queue:**
- All mutations queued when offline
- Queue persisted to disk (not just memory)
- Automatic retry when connection restored

### 8. **Performance Guidelines**

**Don't Block the UI:**
- Database queries happen in main process
- Large operations are chunked
- Loading states for anything >100ms

**Cache Aggressively:**
- Product lookups cached in renderer
- Customer data cached after first lookup
- Invalidate cache on explicit updates

**Batch Operations:**
- Group inventory updates
- Batch sync operations
- Debounce rapid UI updates

## Implementation Examples

### Example: Complete Checkout Flow
```typescript
// 1. Build transaction in renderer
const transaction = checkoutStore.buildTransaction()

// 2. Process payment (hardware interaction)
const payment = await electron.payment.process({
  amount: transaction.total,
  method: 'card'
})

// 3. Complete transaction (database)
const result = await electron.transaction.complete({
  ...transaction,
  payment
})

// 4. Update local state
checkoutStore.reset()
inventoryStore.decrementLocal(transaction.items)

// 5. Print receipt (fire-and-forget)
electron.printer.print(result.receipt)
```

### Example: Multi-Terminal Inventory
```typescript
// Terminal 1 sells item
await electron.inventory.decrement(productId, quantity)

// Main process:
// 1. Updates local database
// 2. Syncs to Supabase
// 3. Supabase emits event

// Terminal 2 receives event
electron.sync.onInventoryChange((change) => {
  inventoryStore.applyRemoteChange(change)
})
```

## Key Decisions Made

1. **Thin Main Process** - Main is mostly a secure bridge, not business logic
2. **Renderer Owns Transaction** - Until saved to database
3. **Optimistic Updates** - Update UI first, sync in background
4. **Event-Driven Hardware** - Hardware emits events, renderer reacts
5. **Feature-Based Stores** - Organized by business domain
6. **Cached Lookups** - Product/customer data cached in renderer

## What This Doesn't Define

- Specific database queries (implementation detail)
- Exact error message formats (can evolve)
- Component structure (that's UI concern)
- External API details (Zinrelo, payment processors)