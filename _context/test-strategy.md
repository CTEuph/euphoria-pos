# Euphoria POS Testing Strategy

## Testing Philosophy
**"Test the money paths obsessively, test the happy paths thoroughly, test the edge cases intelligently"**

## 1. Testing Pyramid

```
         E2E Tests (10%)
        /            \
    Integration (30%)  \
   /                    \
Unit Tests (60%)         Manual Testing
```

## 2. Unit Testing

### What to Unit Test
✅ **MUST Test**
- Price calculations
- Discount logic
- Tax calculations
- Inventory math
- State management actions
- Payment splitting logic

❌ **Don't Unit Test**
- UI component rendering
- Simple getters/setters
- Third-party library calls

### Tools
- **Vitest** - Fast, Vite-native
- **React Testing Library** - For hooks
- **MSW** - Mock API calls

### Example: Discount Engine Test
```typescript
// src/features/checkout/services/discount.service.test.ts
import { describe, it, expect } from 'vitest'
import { calculateCaseDiscount } from './discount.service'
import { mockProducts } from '@/shared/lib/mockData'

describe('Case Discount Engine', () => {
  it('should apply 10% discount on 12 bottles of 750ml wine', () => {
    const items = Array(12).fill(mockProducts.wine750ml)
    const discount = calculateCaseDiscount(items)
    
    expect(discount).toEqual({
      amount: 29.99, // 10% of $299.88
      reason: 'Case discount: 12x 750ml Wine',
      applicable: true
    })
  })
  
  it('should NOT apply discount on mixed categories', () => {
    const items = [
      ...Array(6).fill(mockProducts.wine750ml),
      ...Array(6).fill(mockProducts.liquor750ml)
    ]
    const discount = calculateCaseDiscount(items)
    
    expect(discount.applicable).toBe(false)
  })
  
  it('should handle multiple case discounts in one transaction', () => {
    // Test edge cases
  })
})
```

### Example: State Management Test
```typescript
// src/features/checkout/store/checkout.store.test.ts
import { renderHook, act } from '@testing-library/react'
import { useCheckoutStore } from './checkout.store'

describe('Checkout Store', () => {
  beforeEach(() => {
    useCheckoutStore.setState({ cart: [], total: 0 })
  })
  
  it('should calculate totals when adding items', () => {
    const { result } = renderHook(() => useCheckoutStore())
    
    act(() => {
      result.current.addItem(mockProducts.jackDaniels)
    })
    
    expect(result.current.subtotal).toBe(24.99)
    expect(result.current.tax).toBe(2.00) // 8% tax
    expect(result.current.total).toBe(26.99)
  })
  
  it('should prevent negative inventory', () => {
    // Critical business logic test
  })
})
```

## 3. Integration Testing

### What to Integration Test
- IPC communication between main/renderer
- Database operations
- Hardware simulation
- Multi-feature workflows

### Hardware Simulation Pattern
```typescript
// electron/hardware/__mocks__/BarcodeScanner.ts
export class MockBarcodeScanner {
  private listeners: ((barcode: string) => void)[] = []
  
  on(event: 'scan', callback: (barcode: string) => void) {
    this.listeners.push(callback)
  }
  
  // Test helper to simulate scans
  simulateScan(barcode: string) {
    this.listeners.forEach(cb => cb(barcode))
  }
  
  // Simulate hardware failures
  simulateDisconnect() {
    this.emit('disconnect')
  }
}
```

### IPC Testing
```typescript
// tests/integration/auth.test.ts
import { expect, test } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { _electron as electron } from 'playwright'

test('PIN authentication flow', async () => {
  const app: ElectronApplication = await electron.launch({
    args: ['main.js']
  })
  
  const page: Page = await app.firstWindow()
  
  // Enter PIN
  await page.click('[data-testid="pin-1"]')
  await page.click('[data-testid="pin-2"]')
  await page.click('[data-testid="pin-3"]')
  await page.click('[data-testid="pin-4"]')
  await page.click('[data-testid="pin-enter"]')
  
  // Should navigate to checkout
  await expect(page).toHaveURL('/#/checkout')
})
```

## 4. End-to-End Testing

### Critical User Flows (MUST AUTOMATE)
```typescript
// tests/e2e/critical-paths.spec.ts

test('Complete cash sale with loyalty customer', async ({ page }) => {
  // 1. Login
  await loginAsEmployee(page, '1234')
  
  // 2. Add customer
  await page.keyboard.press('F2') // Customer search
  await page.fill('[data-testid="customer-search"]', '555-0123')
  await page.keyboard.press('Enter')
  
  // 3. Scan items
  await scanProduct(page, '082184090563') // Jack Daniels
  await scanProduct(page, '080686269984') // Grey Goose
  
  // 4. Verify totals
  await expect(page.locator('[data-testid="subtotal"]')).toHaveText('$59.98')
  await expect(page.locator('[data-testid="points-earned"]')).toHaveText('599')
  
  // 5. Process payment
  await page.click('[data-testid="pay-button"]')
  await page.click('[data-testid="cash-100"]')
  
  // 6. Verify change
  await expect(page.locator('[data-testid="change-due"]')).toHaveText('$35.22')
  
  // 7. Complete transaction
  await page.click('[data-testid="complete-sale"]')
})

test('Split payment between cash and card', async ({ page }) => {
  // Critical for liquor stores
})

test('Return with manager override', async ({ page }) => {
  // High-risk operation
})
```

### E2E Test Data Management
```typescript
// tests/e2e/helpers/test-data.ts
export async function setupTestData() {
  // Reset to known state before each test
  await db.delete(transactions).where(/*test data*/)
  await db.insert(products).values(testProducts)
  await db.insert(customers).values(testCustomers)
}

export async function cleanupTestData() {
  // Clean up after tests
}
```

## 5. Performance Testing

### Key Metrics
```typescript
// tests/performance/checkout.perf.ts
test('Checkout performance', async () => {
  const metrics = await measurePerformance(async () => {
    // Add 50 items to cart
    for (let i = 0; i < 50; i++) {
      await addItemToCart(randomProduct())
    }
  })
  
  expect(metrics.avgRenderTime).toBeLessThan(16) // 60fps
  expect(metrics.totalTime).toBeLessThan(5000) // 5 seconds
})

test('Barcode scanning speed', async () => {
  const scanTimes: number[] = []
  
  for (let i = 0; i < 10; i++) {
    const start = performance.now()
    await scanProduct('082184090563')
    scanTimes.push(performance.now() - start)
  }
  
  const avgScanTime = average(scanTimes)
  expect(avgScanTime).toBeLessThan(500) // 500ms per scan
})
```

## 6. Hardware Testing Strategy

### Test Harness
```typescript
// tests/hardware/test-harness.ts
export class HardwareTestHarness {
  async connectAllDevices() {
    await this.scanner.connect()
    await this.printer.connect()
    await this.nfc.connect()
    await this.cashDrawer.connect()
  }
  
  async runDiagnostics() {
    const results = {
      scanner: await this.testScanner(),
      printer: await this.testPrinter(),
      nfc: await this.testNFC(),
      cashDrawer: await this.testCashDrawer()
    }
    return results
  }
}
```

### Hardware Test Scenarios
1. **Device Disconnection**
   - Unplug during transaction
   - Reconnect and continue
   
2. **Paper Out**
   - Mid-receipt printing
   - Before transaction complete
   
3. **Double Scan Prevention**
   - Rapid scanning same item
   - Debounce verification

## 7. Security Testing

### Critical Security Tests
```typescript
// tests/security/payment.security.test.ts
test('Should never log payment card data', async () => {
  const consoleSpy = vi.spyOn(console, 'log')
  
  await processPayment({
    amount: 100,
    cardNumber: '4111111111111111'
  })
  
  // Ensure no card data in logs
  expect(consoleSpy).not.toHaveBeenCalledWith(
    expect.stringContaining('4111')
  )
})

test('PIN should be hashed before storage', async () => {
  const employee = await createEmployee({ pin: '1234' })
  expect(employee.pin).not.toBe('1234')
  expect(employee.pin).toMatch(/^\$2b\$/) // bcrypt hash
})
```

## 8. Manual Testing Checklist

### Daily Smoke Test (5 minutes)
```markdown
- [ ] Login with PIN
- [ ] Scan 5 different products
- [ ] Add customer
- [ ] Process cash payment
- [ ] Print receipt
- [ ] Logout
```

### Weekly Full Test (30 minutes)
```markdown
- [ ] All payment types
- [ ] All discount scenarios
- [ ] Return processing
- [ ] Employee purchases
- [ ] Third-party orders
- [ ] Offline mode operation
- [ ] Multi-terminal sync
```

### Release Testing (2 hours)
```markdown
- [ ] Fresh install on clean Mac
- [ ] Data migration from old version
- [ ] All hardware configurations
- [ ] Performance under load
- [ ] 8-hour continuous operation
```

## 9. Test Data Strategy

### Mock Data Categories
```typescript
// tests/fixtures/products.ts
export const testProducts = {
  // Standard products
  wine750ml: { price: 24.99, category: 'wine' },
  liquor1750ml: { price: 54.99, category: 'liquor' },
  
  // Edge cases
  zeroPrice: { price: 0, name: 'Free Sample' },
  expensiveItem: { price: 9999.99, name: 'Rare Whiskey' },
  
  // Case discount scenarios
  caseWine: Array(12).fill(wine750ml),
  almostCase: Array(11).fill(wine750ml),
}
```

## 10. Continuous Testing

### Git Hooks
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:unit",
      "pre-push": "npm run test:integration"
    }
  }
}
```

### CI/CD Pipeline
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: npm install
      - name: Unit tests
        run: npm run test:unit
      - name: Integration tests
        run: npm run test:integration
      - name: E2E tests
        run: npm run test:e2e
```

## 11. Testing Commands

```json
// package.json scripts
{
  "test": "vitest",
  "test:unit": "vitest run --dir src",
  "test:integration": "vitest run --dir tests/integration",
  "test:e2e": "playwright test",
  "test:watch": "vitest --watch",
  "test:coverage": "vitest --coverage",
  "test:hardware": "node tests/hardware/diagnostic.js"
}
```

## Test Coverage Goals

| Category | Target | Priority |
|----------|--------|----------|
| Payment Logic | 100% | Critical |
| Discount Engine | 100% | Critical |
| State Management | 90% | High |
| IPC Handlers | 80% | High |
| UI Components | 60% | Medium |
| Utilities | 80% | Medium |

## Red Flags That Need Tests

1. **Any code that touches money**
2. **Inventory calculations**
3. **Customer point calculations**
4. **State synchronization**
5. **Hardware error recovery**
6. **Offline queue management**

## Testing Principles

1. **Test behavior, not implementation**
2. **Each test should tell a story**
3. **Fail fast with clear messages**
4. **Mock at the boundary (IPC/hardware)**
5. **Real data for critical paths**