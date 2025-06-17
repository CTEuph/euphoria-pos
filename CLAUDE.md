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

## Technology Stack

- **Desktop**: Electron 36+ (runs on Mac Mini M2)
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **State**: Zustand + React Query
- **Database**: PostgreSQL + Drizzle ORM
- **UI Components**: Radix UI (shadcn/ui)
- **Build**: Electron-Vite + Electron-Builder
- **Hardware**: node-hid, SerialPort, USB libraries

## Current Status

Project is in early development phase with boilerplate structure complete. Features are planned but not yet implemented. The comprehensive database schema and architecture indicate this will be a full-featured POS system with advanced capabilities like loyalty programs, multi-lane support, and extensive hardware integration.