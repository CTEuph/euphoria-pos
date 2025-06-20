# AI Coding Rules for Euphoria POS

## Project Overview
You are working on a Point of Sale (POS) system for a liquor store built with Electron + React + TypeScript. The system prioritizes inventory accuracy, fast checkout, and hardware integration.

## Technology Stack
- **Frontend**: React 18, TypeScript, Zustand, TailwindCSS 3.x (NOT v4!), shadcn/ui components
- **Desktop**: Electron 28+ with electron-vite
- **Database**: PostgreSQL via Supabase with Drizzle ORM
- **Hardware**: SerialPort, node-hid for scanners/printers/RFID
- **Payments**: CardPointe terminal (serial/USB)
- **Build**: Vite, electron-builder
- **Auth**: PIN-based for POS, Supabase auth for web dashboard (future)

## Project Structure Rules

### File Organization
```
/electron           - Main process only (Node.js environment)
  /hardware        - Hardware device classes
  /ipc            - IPC handlers
  /services       - Business logic that needs Node.js
  
/src               - Renderer process only (React app)
  /features       - Vertical slice architecture
    /checkout     - Each feature is self-contained
      /components - React components for this feature
      /hooks      - Custom hooks for this feature
      /services   - Business logic for this feature
      /store      - Zustand store slice
      /types.ts   - Feature-specific types
      /index.ts   - Public API exports
  /shared         - Only truly shared code
    /components   - Design system components
    /hooks        - Generic hooks (useDebounce, etc)
    /lib          - Utilities
    /types        - Global types

/drizzle          - Database schema and migrations
/ai-docs          - Reference documentation (DO NOT MODIFY)
```

### Critical Rules

1. **NEVER put database queries in renderer process**
   ```typescript
   // ❌ WRONG - Never in React components
   const products = await db.select().from(products)
   
   // ✅ CORRECT - Always through IPC
   const products = await window.electron.database.getProducts()
   ```

2. **NEVER access hardware directly from React**
   ```typescript
   // ❌ WRONG - SerialPort in renderer
   import { SerialPort } from 'serialport'
   
   // ✅ CORRECT - Through IPC
   window.electron.scanner.onScan((barcode) => {})
   ```

3. **ALWAYS use vertical slices**
   ```typescript
   // ❌ WRONG - Scattered organization
   /components/Cart.tsx
   /hooks/useCart.ts
   /services/cartService.ts
   
   // ✅ CORRECT - Feature-based
   /features/checkout/components/Cart.tsx
   /features/checkout/hooks/useCart.ts
   /features/checkout/services/cartService.ts
   ```
4. ** AVOID useEffect as much as possible**


## IPC Communication Patterns

### Pattern 1: Command/Response
```typescript
// In preload.ts
contextBridge.exposeInMainWorld('electron', {
  database: {
    getProduct: (barcode: string) => ipcRenderer.invoke('db:get-product', barcode)
  }
})

// In React component
const product = await window.electron.database.getProduct(barcode)
```

### Pattern 2: Event Subscription
```typescript
// In preload.ts
scanner: {
  onScan: (callback: (barcode: string) => void) => {
    const subscription = (_event: any, barcode: string) => callback(barcode)
    ipcRenderer.on('scanner:data', subscription)
    return () => ipcRenderer.removeListener('scanner:data', subscription)
  }
}

// In React component - use custom hook instead of useEffect
function useBarcodeScan(onScan: (barcode: string) => void) {
  useSyncExternalStore(
    (callback) => window.electron.scanner.onScan(callback),
    () => null, // No snapshot needed for events
    () => null  // Server snapshot
  )
  
  // Or even better - direct event handler on component mount
  const handleScan = useCallback(onScan, [onScan])
  
  // Subscribe on render, cleanup automatic
  window.electron.scanner.onScan?.(handleScan)
}
```

## State Management Rules

### Zustand Store Pattern
```typescript
// Each feature gets ONE store
interface CheckoutStore {
  // State (minimal, normalized)
  cart: CartItem[]
  customerId: string | null
  
  // Computed values (use get, don't store)
  get total(): number
  get itemCount(): number
  
  // Actions (always immutable updates)
  addItem: (product: Product) => void
  removeItem: (itemId: string) => void
  clearCart: () => void
}

// Implementation
export const useCheckoutStore = create<CheckoutStore>((set, get) => ({
  cart: [],
  customerId: null,
  
  get total() {
    return get().cart.reduce((sum, item) => sum + item.total, 0)
  },
  
  addItem: (product) => set((state) => ({
    cart: [...state.cart, { ...product, quantity: 1 }]
  })),
}))
```

## Component Rules

### 1. Use Functional Components Only
```typescript
// ✅ CORRECT
export function ProductList() {
  return <div>...</div>
}

// ❌ WRONG - No class components
export class ProductList extends React.Component {}
```

### 2. Co-locate Related Code
```typescript
// Same file if small enough
function ProductCard({ product }: { product: Product }) {
  return <div>...</div>
}

function ProductActions({ onAdd }: { onAdd: () => void }) {
  return <button onClick={onAdd}>Add</button>
}

export function ProductList() {
  return <div>...</div>
}
```

### 3. Type All Props
```typescript
// Always define interfaces
interface CartProps {
  items: CartItem[]
  onRemove: (itemId: string) => void
  readOnly?: boolean  // Optional props marked clearly
}

export function Cart({ items, onRemove, readOnly = false }: CartProps) {
  // Component implementation
}
```

## Database/Drizzle Rules

### 1. Schema is Source of Truth
```typescript
// Always import types from schema
import type { Product, Customer, Transaction } from '@/drizzle/schema'

// Never create duplicate type definitions
```

### 2. Database Operations in Main Process
```typescript
// electron/ipc/handlers/database.ts
ipcMain.handle('db:get-products', async () => {
  return await db.select().from(products).where(eq(products.isActive, true))
})
```

### 3. Use Transactions for Multi-Table Updates
```typescript
// When updating inventory and creating transaction
await db.transaction(async (tx) => {
  await tx.insert(transactions).values(transactionData)
  await tx.update(inventory).set({ 
    currentStock: sql`${inventory.currentStock} - ${quantity}` 
  })
})
```

## Error Handling Rules

### 1. User-Friendly Messages
```typescript
try {
  await processPayment()
} catch (error) {
  // Log full error for debugging
  console.error('Payment failed:', error)
  
  // Show user-friendly message
  toast.error('Payment could not be processed. Please try again.')
}
```

### 2. Always Handle Hardware Disconnection
```typescript
const handleScan = async (barcode: string) => {
  try {
    const product = await lookupProduct(barcode)
    addToCart(product)
  } catch (error) {
    if (error.code === 'SCANNER_DISCONNECTED') {
      setManualMode(true)
      toast.warning('Scanner disconnected. Entering manual mode.')
    }
  }
}
```

## Testing Patterns

### 1. Mock Hardware in Development
```typescript
// electron/hardware/BarcodeScanner.ts
export class BarcodeScanner {
  async simulateScan(barcode: string) {
    if (process.env.NODE_ENV === 'development') {
      this.emit('scan', barcode)
    }
  }
}
```

### 2. Use Mock Data During Development
```typescript
// src/shared/lib/mockData.ts
export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Jack Daniels 750ml',
    price: 24.99,
    barcode: '082184090563'
  }
]

// Use in components
const products = import.meta.env.DEV ? mockProducts : await fetchProducts()
```

## Common Tasks

### Adding a New Feature
1. Create folder: `/src/features/[feature-name]/`
2. Add standard subfolders: `components`, `hooks`, `services`, `store`
3. Create `types.ts` for feature-specific types
4. Create `index.ts` to export public API
5. Add IPC handlers if needed in `/electron/ipc/handlers/`

### Adding Hardware Support
1. Create class in `/electron/hardware/`
2. Add IPC methods in preload.ts
3. Create handlers in `/electron/ipc/handlers/`
4. Add React hook in feature that uses it
5. Always include disconnect handling

### Adding a New Database Table
1. Update `/drizzle/schema.ts`
2. Run `npm run db:push` for development
3. Create migration for production
4. Update types imports in affected features
5. Add IPC handlers for CRUD operations

### Implementing Authentication
1. PIN verification ALWAYS in main process
2. Store employee session in main process only
3. Renderer only gets boolean + basic info (id, name)
4. All IPC handlers check currentEmployee
5. Use auth store with persist middleware for isAuthenticated flag

## Performance Rules

### 1. Debounce Rapid Updates
```typescript
// For search inputs
const debouncedSearch = useMemo(
  () => debounce((term: string) => searchProducts(term), 300),
  []
)
```

### 2. Virtualize Long Lists
```typescript
// For 100+ items, use virtual scrolling
import { VirtualList } from '@tanstack/react-virtual'
```

### 3. Optimize Re-renders
```typescript
// Memo expensive components
export const ProductList = memo(({ products }: Props) => {
  // Component
})

// Use shallow comparison in Zustand
const cartItems = useCheckoutStore((state) => state.cart, shallow)
```

## Style Rules

### 1. Use Tailwind Classes
```typescript
// ✅ CORRECT
<div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow">

// ❌ WRONG - No inline styles
<div style={{ display: 'flex', gap: '1rem' }}>
```

### 2. Consistent Spacing
- Use Tailwind spacing scale: `p-2`, `p-4`, `p-6`, etc.
- Consistent gaps: `gap-2`, `gap-4`
- Standard border radius: `rounded`, `rounded-lg`

### 3. Component Variants with CVA
```typescript
import { cva } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium',
  {
    variants: {
      variant: {
        primary: 'bg-blue-500 text-white hover:bg-blue-600',
        secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
)
```

## Git Commit Rules

### Commit Message Format
```
type(scope): description

feat(checkout): add barcode scanner support
fix(payment): handle declined cards properly
refactor(customer): simplify lookup logic
docs(api): update IPC documentation
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that neither fixes nor adds
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc.
- `test`: Adding missing tests
- `chore`: Maintain

## Security Rules

### 1. Never Trust Renderer Input
```typescript
// In main process, always validate
ipcMain.handle('process-payment', async (event, amount) => {
  // Validate amount is positive number
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Invalid payment amount')
  }
  // Process payment
})
```

### 2. Sanitize Database Inputs
```typescript
// Use parameterized queries (Drizzle does this automatically)
await db.select().from(products).where(eq(products.barcode, userInput))
```

### 3. No Sensitive Data in Renderer
- Never store payment card data
- Don't expose database credentials
- Keep API keys in main process only

## What NOT to Do

1. **DON'T use localStorage** - Use IPC to persist data
2. **DON'T import Node modules in renderer** - Only in main process
3. **DON'T create generic shared components too early** - Wait for 3 uses
4. **DON'T use any type** - Always define proper types
5. **DON'T skip error handling** - Every async operation needs try/catch
6. **DON'T query database from renderer** - Always use IPC
7. **DON'T create deeply nested component folders** - Keep it flat
8. **DON'T use default exports** - Named exports only
9. **DON'T mutate state directly** - Always create new objects/arrays
10. **DON'T ignore TypeScript errors** - Fix them properly

## Quick Reference

### Check if in renderer or main process
```typescript
// In main process
if (typeof window === 'undefined') {
  // Main process code
}

// In renderer process  
if (typeof window !== 'undefined') {
  // Renderer code
}
```

### Common IPC channels
- `auth:*` - Authentication operations
- `db:*` - Database operations
- `scanner:*` - Barcode scanner events
- `printer:*` - Receipt printer commands
- `payment:*` - Payment terminal operations
- `sync:*` - Cloud synchronization
- `config:*` - Terminal/business configuration

### File naming
- Components: PascalCase.tsx
- Hooks: camelCase.ts starting with 'use'
- Services: camelCase.ts
- Types: camelCase.ts or types.ts
- Stores: camelCase.store.ts

Remember: When in doubt, check the existing code patterns in the project!