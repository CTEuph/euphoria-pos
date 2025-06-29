# Euphoria POS - Implementation Guide

## Current Status ✅
- Basic checkout UI with cart
- PIN authentication
- Mock product data
- Zustand state management (properly implemented)
- Tailwind 3.x + shadcn/ui setup
- **NEW**: Barcode scanner simulation with global keyboard capture
- **NEW**: Toast notification system with audio feedback
- **NEW**: Keyboard shortcuts for instant product scanning

## Phase 1: Core Business Logic (Current)

### Task 1.1: Barcode Scanner Simulation ✅
**Goal**: Simulate hardware before real scanner arrives

**Requirements**:
- Global keyboard listener in checkout view
- Capture numeric input ending with Enter
- Debounce rapid inputs (real scanners are fast)
- Visual feedback when scanning

**Implementation**:
```typescript
// useBarcodeScanner hook with global keyboard capture
- Global event listener captures numeric keys + Enter
- Keyboard shortcuts (Shift+J for Jack Daniels, etc.)
- Toast notifications for success/error feedback
- Audio feedback using Web Audio API for Electron
- Modal state detection disables scanning appropriately
```

**Acceptance Criteria**:
- [x] Type "082184090563" + Enter adds Jack Daniels to cart
- [x] Non-numeric input ignored
- [x] Unknown barcodes show "Product not found" toast
- [x] Can scan while focused anywhere on checkout screen
- [x] Keyboard shortcuts (Shift+J) for instant product addition
- [x] Audio feedback for success/error states

**✅ COMPLETED**: Full barcode scanner simulation with global keyboard capture, keyboard shortcuts (Shift+J/G/C), toast notifications, and audio feedback. Ready for hardware integration in Phase 2.

### Task 1.2: Product Search & Manual Entry ✅
**Goal**: Fallback when scanner fails or product missing barcode

**Requirements**:
- 1 search box for products and barcodes
- Search by: name, SKU, partial barcode
- Intelligent substring matching ("ja dan" finds "Jack Daniel's")
- Keyboard navigation (arrow keys + enter)
- Show price and SKU in results
- Scanner priority and search clearing

**Implementation**:
```typescript
// Enhanced BarcodeInput with dual-mode operation
- Auto-detection: 12+ digits = barcode, letters = search
- Real-time search dropdown with max 8 results
- Keyboard navigation: ↑↓ arrows, Enter, Escape
- Click-to-select functionality
- Scanner clears active search automatically
- Scroll-into-view for dropdown navigation
```

**Acceptance Criteria**:
- [x] Typing "jack" shows all Jack Daniel's in dropdown
- [x] Arrow keys navigate results with visual highlighting
- [x] Enter adds highlighted item to cart
- [x] Escape closes dropdown
- [x] Scanner takes priority and clears search
- [x] Intelligent substring matching ("ja dan" → "Jack Daniel's")

**✅ COMPLETED**: Full product search with intelligent substring matching, keyboard navigation, and seamless scanner integration. Local state management with useMemo (no useEffect complexity). Comprehensive testing with 19 unit tests covering business logic. Ready for USB scanner hardware testing.

### Task 1.3: Advanced Discount System ⏳
**Goal**: Professional discount management with authorization and audit

**Requirements**:
- Item-level discount modal (click cart item)
- Order-level discount modal (apply to whole order)
- Employee discount limits with manager approval
- Preapproved discount library
- Custom discount entry
- Full audit trail with reasons

**System Architecture**:
```typescript
// POS Discount Modals
- ItemDiscountModal: Apply discounts to specific products
- OrderDiscountModal: Apply discounts to entire order
- ManagerApprovalModal: PIN + reason for over-limit discounts

// Employee Authorization Levels
- Regular Employee: Limited discount amounts
- Manager: Unlimited discounts + approval rights
- Custom limits per employee configurable

// Preapproved Discount Library
- Military Discount (10% with ID verification)
- Senior Discount (5% for 65+)
- Damaged Item Discount (manager only)
- Employee Friends Discount (manager approval)
```

**Web Admin Features**:
- Create/edit discount rules engine
- Set employee discount limits
- View discount analytics and audit reports
- Push discount rules to POS terminals

**Automatic Discount Rules**:
```
Wine/Liquor 750ml or 1L: 12 bottles = 10% off
Wine/Liquor 1.5L or 1.75L: 6 bottles = 10% off
Must be same category (wine OR liquor, not mixed)
```

**Acceptance Criteria**:
- [ ] Click cart item opens discount modal with preapproved options
- [ ] Custom discount over employee limit triggers manager approval
- [ ] Manager enters PIN + reason for discount authorization
- [ ] All discounts saved with employee ID, manager approval, and reason
- [ ] 12x Jack Daniels 750ml shows automatic $29.99 discount
- [ ] Preapproved discounts available as one-click buttons
- [ ] Discount audit trail available for compliance review

### Task 1.4: Customer Management ⏳
**Goal**: Loyalty points and customer history

**Requirements**:
- Customer search modal
- Search by phone or name
- Display loyalty points balance
- Show recent purchases
- Add new customer inline

**Mock Customers**:
```typescript
{
  id: '1',
  name: 'John Smith',
  phone: '555-0123',
  points: 1250,
  lastVisit: '2024-01-15'
}
```

**Acceptance Criteria**:
- [ ] F2 key opens customer search
- [ ] Shows customer name and points in header
- [ ] Points calculated: $1 = 10 points
- [ ] Can clear customer from transaction

### Task 1.5: Payment Processing UI ⏳
**Goal**: Multiple payment types per PRD

**Requirements**:
- Payment modal with options
- Split payment support
- Quick cash buttons ($20, $50, $100)
- Change calculation
- Payment validation

**Payment Types**:
- Cash (with change)
- Credit/Debit (simulate for now)
- Gift Card (enter number)
- Loyalty Points (1000 pts = $10)
- Split across multiple

**Acceptance Criteria**:
- [ ] Can't complete without full payment
- [ ] Cash shows change amount
- [ ] Can split $50 as $30 cash + $20 card
- [ ] Third-party orders skip payment

## Phase 2: Hardware Integration

### Task 2.1: Real Barcode Scanner
**Goal**: Replace keyboard simulation with USB scanner

**Requirements**:
- Auto-detect scanner connection
- Fallback to manual entry
- Configure scanner for Enter suffix
- Handle disconnect gracefully

**Test Scenarios**:
- Scanner disconnected mid-transaction
- Double-scan same item rapidly
- Scan while in payment modal (should ignore)

### Task 2.2: Receipt Printer
**Goal**: Print receipts via Star TSP143IIIU

**Requirements**:
- ESC/POS command generation
- Paper out detection
- Print receipt on payment complete
- Reprint last receipt function
- Open cash drawer command

**Receipt Format**:
```
    EUPHORIA LIQUOR
    123 Main Street
    City, ST 12345
    (555) 123-4567
    
Date: 01/15/24  Time: 2:30 PM
Cashier: John Doe
Terminal: POS-1

------------------------
Jack Daniels 750ml
  2 @ $24.99       $49.98
  
Grey Goose 750ml
  1 @ $34.99       $34.99
------------------------
Subtotal:          $84.97
Tax (8%):           $6.80
TOTAL:             $91.77

CASH:             $100.00
CHANGE:             $8.23
------------------------
Points Earned: 917

Thank you!
```

### Task 2.3: RFID/NFC Customer Cards
**Goal**: Tap card for instant customer recognition

**Requirements**:
- ACR122U reader integration
- Card enrollment flow
- Instant customer load on tap
- Visual/audio feedback

### Task 2.4: Payment Terminal
**Goal**: CardPointe Ingenico integration

**Requirements**:
- Serial communication setup
- Send amount to terminal
- Wait for customer interaction
- Handle approved/declined
- No sensitive card data storage

## Phase 3: Database & Sync

### Task 3.1: Supabase Setup
**Goal**: Connect to real database

**Requirements**:
- Run Drizzle migrations
- Seed initial data
- Environment configuration
- Connection error handling

### Task 3.2: Product Sync
**Goal**: Real products from database

**Requirements**:
- Initial product load on startup
- Cache in renderer for speed
- Real-time price updates
- Offline product cache

### Task 3.3: Transaction Persistence
**Goal**: Save all transactions

**Requirements**:
- Save on payment complete
- Include all PRD fields
- Offline queue for sync
- Zinrelo points sync

### Task 3.4: Multi-Terminal Sync
**Goal**: Two POS terminals share inventory

**Requirements**:
- Real-time inventory updates
- Conflict resolution
- Terminal identification
- Sync status indicator

## Phase 4: Advanced Features

### Task 4.1: Returns & Exchanges
- Transaction lookup
- Manager approval
- Inventory adjustment
- Receipt printing

### Task 4.2: Reports & Analytics
- Daily sales summary
- Cash drawer reconciliation
- Employee sales tracking
- Export functions

### Task 4.3: Employee Features
- Employee purchase mode
- Special pricing rules
- Tab management
- Shift management

### Task 4.4: Web Admin Dashboard
**Goal**: Centralized management for discount rules and employee permissions

**Features**:
- Discount rules engine with visual builder
- Employee discount limit configuration
- Real-time discount analytics and reporting
- Audit trail viewer with search/filter
- Preapproved discount library management
- Push configuration updates to POS terminals
- Revenue impact analysis by discount type
- Employee discount usage monitoring

### Task 4.5: Advanced Discount Analytics
**Goal**: Business intelligence for discount optimization

**Features**:
- Discount ROI analysis
- Customer response to discount campaigns
- Employee discount usage patterns
- Manager approval frequency tracking
- Revenue impact by discount type
- Compliance reporting for accounting
- Automated alerts for unusual discount patterns

## Testing Checklist

### Daily Operations Test
1. [ ] Open store - login with PIN
2. [ ] Scan 20 items rapidly
3. [ ] Apply case discount
4. [ ] Add customer for loyalty
5. [ ] Process split payment
6. [ ] Print receipt
7. [ ] Handle return
8. [ ] Close drawer/reconcile

### Edge Cases Test
1. [ ] Scanner disconnects mid-sale
2. [ ] Printer out of paper
3. [ ] Internet goes down
4. [ ] Invalid barcode scanned
5. [ ] Customer has no points for redemption
6. [ ] Void transaction after partial payment

## Success Metrics
- Checkout time: <90 seconds average
- Scanner reliability: 99.9% reads
- Sync lag: <5 seconds between terminals
- Zero lost transactions
- Accurate inventory counts

## Development Tips

### For Each Task:
1. Build UI first with mock data
2. Add business logic with tests
3. Integrate with hardware/backend
4. Handle error cases
5. Polish UX

### AI Prompting:
- Reference specific task number
- Include acceptance criteria
- Mention which documents to follow
- Give example of expected behavior

### Example Prompt:
"Implement Task 1.1 Barcode Scanner Simulation following the patterns in checkout.store.ts. It should capture numeric keyboard input and add products to cart on Enter. Show toast notifications for scanning status."