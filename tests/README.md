# Euphoria POS Testing Suite

## Overview
This testing suite follows the focused testing strategy outlined in `ai-docs/guides/testing-implementation-plan.md`.

## Test Structure
```
tests/
├── unit/              # Unit tests for individual functions and hooks
├── integration/       # Integration tests for feature workflows  
├── e2e/              # End-to-end tests for complete user flows
├── mocks/            # Mock implementations for Electron APIs
├── helpers/          # Test utilities and helpers
└── setup.ts          # Global test setup and mocks
```

## Running Tests

### All Tests
```bash
npm test                # Run all tests in watch mode
```

### Specific Test Types
```bash
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e        # End-to-end tests only
```

### Development
```bash
npm run test:watch     # Watch mode for development
npm run test:ui        # Visual test runner UI
npm run test:coverage  # Run with coverage report
```

## Test Environment

### Unit Testing
- **Framework**: Vitest (fast, Vite-native)
- **Environment**: jsdom (simulates browser DOM)
- **React Testing**: @testing-library/react
- **Coverage**: c8 (built into Vitest)

### E2E Testing
- **Framework**: Playwright (Electron support)
- **Environment**: Real Electron app instance

### Mocking Strategy
- **Electron APIs**: Mocked in `tests/mocks/electron.ts`
- **Web Audio API**: Mocked globally for audio feedback testing
- **Crypto API**: Mocked for UUID generation

## Test Utilities

### Helper Functions
Located in `tests/helpers/test-utils.ts`:
- `createMockProduct()` - Generate mock product data
- `createMockCartItem()` - Generate mock cart items
- `createKeyboardEvent()` - Simulate keyboard events
- `createMockAudioContext()` - Mock audio context

### Custom Render
Use the custom render function that includes necessary providers:
```typescript
import { render } from '../helpers/test-utils'
```

## Writing Tests

### Unit Test Example
```typescript
import { describe, it, expect } from 'vitest'
import { createMockProduct } from '../helpers/test-utils'

describe('Feature Name', () => {
  it('should do something specific', () => {
    const product = createMockProduct({ price: 24.99 })
    expect(product.price).toBe(24.99)
  })
})
```

### React Hook Testing
```typescript
import { renderHook } from '@testing-library/react'
import { useYourHook } from '@/features/feature/hooks/useYourHook'

it('should handle hook logic', () => {
  const { result } = renderHook(() => useYourHook())
  expect(result.current.someValue).toBe(expectedValue)
})
```

## Coverage Goals
- **Critical Business Logic**: 90%+ (payment, discount, inventory)
- **State Management**: 90%+ (Zustand stores)
- **React Hooks**: 80%+ (custom hooks)
- **UI Components**: 60%+ (focus on logic, not rendering)

## Next Steps
1. ✅ Phase 1: Testing Foundation (Complete)
2. 🔄 Phase 2: Task 1.1 Testing (Next - Barcode Scanner)
3. ⏳ Phase 3: Critical Business Logic Testing
4. ⏳ Phase 4: Basic E2E Setup

See `ai-docs/guides/testing-implementation-plan.md` for full implementation details.