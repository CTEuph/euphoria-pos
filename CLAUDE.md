# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Euphoria POS is a modern point-of-sale system built with Electron + React for Euphoria Liquor. It replaces an aging Clover system with a custom solution that supports multi-lane operation, offline-first architecture, hardware integration, and loyalty programs.

## Development Commands

### Core Development
- `npm run dev` - Start development server (builds and runs with hot reload)
- `npm run build` - Build the application for production
- `npm run preview` - Preview production build
- `npm start` - Alternative to preview

### Distribution
- `npm run pack` - Package app for current platform (creates distributable folder)
- `npm run dist` - Create installer/dmg for current platform
- `npm run dist:mac` - Create macOS-specific distribution

### Database
- `npx drizzle-kit generate` - Generate database migrations from schema changes
- `npx drizzle-kit migrate` - Apply pending migrations to database
- `npx drizzle-kit studio` - Open Drizzle Studio for database inspection

### Testing
- `npm test` - Run all tests in watch mode
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run test:e2e` - Run end-to-end tests only
- `npm run test:watch` - Run tests in watch mode for development
- `npm run test:coverage` - Run tests with coverage reporting
- `npm run test:ui` - Open visual test runner interface

## Architecture

### Feature-Driven Structure
The app uses vertical slice architecture where each business domain is self-contained:

```
src/features/[domain]/
├── components/     # UI components for this domain
├── hooks/         # React hooks specific to this domain
├── services/      # Business logic and API calls
└── store/         # Zustand state management slices
```

Current domains: `checkout`, `customer`, `employee`, `inventory`, `product`, `layout`

### Electron Architecture
- **Main Process** (`electron/main.ts`): App lifecycle, window management
- **Preload** (`electron/preload.ts`): Secure bridge between main and renderer
- **Hardware** (`electron/hardware/`): Barcode scanners, receipt printers, RFID readers, payment terminals
- **IPC Handlers** (`electron/ipc/handlers/`): Inter-process communication
- **Services** (`electron/services/`): Core business logic, inventory sync, offline queuing

### Path Aliases
- `@/` → `src/`
- `@shared/` → `src/shared/`
- `@features/` → `src/features/`

### State Management
- **Zustand**: Local application state (one slice per feature)
- **React Query**: Server state, caching, background sync
- **Drizzle ORM**: Database operations with PostgreSQL

## Database Schema

Comprehensive POS schema includes:
- **Products**: SKU, barcodes, pricing, categories (wine/liquor/beer), linked products (single ↔ 4-pack)
- **Transactions**: Multi-tender payments, sales channels (POS/DoorDash/GrubHub/Employee), offline queuing
- **Customers**: Loyalty integration, RFID/NFC support, purchase history
- **Employees**: Role-based permissions, employee pricing, PIN authentication
- **Inventory**: Real-time stock levels, multi-lane sync, audit trail
- **Case Discounts**: Automatic bulk pricing (12-pack wine, 6-pack large bottles)

## Key Business Logic

### Case Discount Rules
- **Wine/Liquor 750ml/1L**: 12 units = case discount
- **Wine/Liquor 1.5L/1.75L**: 6 units = case discount
- Must be same product category (no mixing wine & liquor)

### Employee Pricing
Cost + round up to nearest dollar, tracked in separate sales channel

### Multi-Lane Operation
2 checkout lanes with near real-time inventory sync, conflict resolution for simultaneous updates

### Sales Channels
- `pos`: Regular retail sales
- `doordash`/`grubhub`: Third-party delivery (no payment, inventory tracking only)
- `employee`: Employee purchases with special pricing

## Hardware Integration

All hardware communication happens in Electron main process:
- **Barcode Scanners**: USB HID interface
- **Receipt Printers**: SerialPort/USB
- **RFID/NFC Readers**: Customer loyalty card recognition
- **Payment Terminals**: Card processing integration

## Development Guidelines

### TypeScript
- Strict type checking enabled
- Use Drizzle schema types: `Product`, `Transaction`, `Customer`, etc.
- Define feature-specific types in `src/shared/types/`

### Components
- Use shadcn/ui components from `@/components/ui`
- Feature components go in respective `features/[domain]/components/`
- Shared components in `src/shared/components/`

### Database Operations
- Use Drizzle ORM for all database operations
- Database URL from `process.env.DATABASE_URL`
- Schema defined in `drizzle/schema.ts`

### Offline-First Design
- Queue transactions when offline
- Sync inventory changes across lanes
- Handle network interruptions gracefully
- Use React Query for automatic retry and caching

### Testing Strategy
- **Philosophy**: "Test the money paths obsessively, test the happy paths thoroughly, test the edge cases intelligently"
- **Unit Tests**: 60% of testing pyramid - Focus on business logic, calculations, state management
- **Integration Tests**: 30% of testing pyramid - Feature workflows, IPC communication, hardware simulation
- **E2E Tests**: 10% of testing pyramid - Critical user flows, complete checkout scenarios
- **Coverage Goals**: 90%+ for payment/discount logic, 80%+ for state management, 60%+ for UI components

## Technology Stack

- **Desktop**: Electron 36+ (runs on Mac Mini M2)
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **State**: Zustand + React Query
- **Database**: PostgreSQL + Drizzle ORM
- **UI Components**: Radix UI (shadcn/ui)
- **Build**: Electron-Vite + Electron-Builder
- **Hardware**: node-hid, SerialPort, USB libraries
- **Testing**: Vitest + React Testing Library + Playwright

## Testing Framework

### Test Structure
```
tests/
├── unit/              # Unit tests for individual functions and hooks
├── integration/       # Integration tests for feature workflows  
├── e2e/              # End-to-end tests for complete user flows
├── mocks/            # Mock implementations for Electron APIs
├── helpers/          # Test utilities and POS-specific helpers
└── setup.ts          # Global test configuration and mocks
```

### Testing Environment
- **Unit Testing**: Vitest with jsdom environment for React component testing
- **Mocking**: Comprehensive mocks for Electron APIs, Web Audio API, and hardware interfaces
- **E2E Testing**: Playwright configured for Electron app testing
- **Coverage**: v8 coverage provider with configurable thresholds

### Test Utilities
- `createMockProduct()` - Generate realistic product test data
- `createMockCartItem()` - Generate cart item test data  
- `createKeyboardEvent()` - Simulate barcode scanner keyboard events
- `createMockAudioContext()` - Mock audio context for audio feedback testing

### Critical Test Areas
1. **Payment Processing** - All payment calculations, split payments, change calculation
2. **Discount Engine** - Case discounts, employee pricing, loyalty point calculations
3. **Inventory Management** - Stock updates, multi-lane sync, conflict resolution
4. **Hardware Integration** - Barcode scanning, receipt printing, payment terminal communication
5. **State Management** - Zustand store actions, computed values, persistence

## Current Status

Project has completed **Task 1.1: Barcode Scanner Simulation** with comprehensive testing framework in place. The testing foundation supports rapid development of remaining POS features with confidence in system reliability.