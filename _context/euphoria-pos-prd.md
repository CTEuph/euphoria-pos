# Euphoria Liquor POS - Mini PRD
*Version 1.0 - December 2024*

## Executive Summary

A modern, extensible point-of-sale system for Euphoria Liquor that prioritizes inventory accuracy, fast checkout, and seamless multi-lane operation. Built on standard hardware (Mac Mini) to reduce costs and increase reliability versus proprietary systems like Clover.

## Problem Statement

**Current Pain Points:**
- Clover hardware is expensive and deteriorating (scanner skipping items)
- Cannot extend or customize Clover to meet business needs
- Limited integration capabilities for future enhancements
- Vendor lock-in with proprietary hardware

**Desired Outcome:**
A reliable, fast, and extensible POS system that maintains perfect inventory accuracy while enabling future AI/automation integrations.

## User Personas

### 1. Cashier (Primary User)
- **Tech Savvy**: Medium
- **Goals**: Process customers quickly, handle various payment types, avoid inventory errors
- **Frustrations**: Scanner misses, slow customer lookup, complex returns

### 2. Manager
- **Tech Savvy**: Medium
- **Goals**: Monitor sales, manage employee purchases, handle exceptions
- **Needs**: Override capabilities, reporting access, drawer management

### 3. Owner
- **Tech Savvy**: Medium-High
- **Goals**: Accurate inventory, sales insights, system reliability
- **Needs**: Full system access, configuration control, data export

## Core User Stories

### Transaction Processing
- **As a cashier**, I want to scan products quickly and reliably so customers don't wait
- **As a cashier**, I want to easily add customers to transactions for loyalty points
- **As a cashier**, I want to process split payments across multiple tenders
- **As a cashier**, I want to ring up third-party orders (DoorDash/GrubHub) as a separate sales channel

### Customer Management
- **As a cashier**, I want to find customers by phone/name when they forget their loyalty card
- **As a cashier**, I want customers to tap their phone (NFC) for instant recognition
- **As a customer**, I want to earn and redeem Zinrelo loyalty points seamlessly

### Inventory & Products
- **As a cashier**, I want to scan items and have the right product appear every time
- **As a manager**, I want to add new barcodes to products when labels change
- **As a manager**, I want case discounts to apply automatically based on quantity
- **As the system**, I must maintain perfect inventory accuracy across all channels

### Special Transactions
- **As a cashier**, I want to look up past orders for returns/exchanges
- **As a cashier**, I want to hold orders for later completion
- **As an employee**, I want to purchase items at employee pricing with deferred payment
- **As a manager**, I want employee purchases tracked separately from regular sales

## Acceptance Criteria

### Performance
- ✓ Product scan to screen: <500ms
- ✓ Transaction completion: <2 seconds
- ✓ Customer lookup: <1 second
- ✓ Lane sync: <5 seconds

### Reliability
- ✓ Offline mode with queue for later sync
- ✓ No duplicate inventory deductions
- ✓ Zero lost transactions
- ✓ Automatic recovery from hardware disconnection

### Accuracy
- ✓ 100% inventory integrity (no double-deductions)
- ✓ Correct tax calculation every time
- ✓ Accurate loyalty point earning/redemption
- ✓ Proper sales channel attribution

## In Scope - Phase 1

### Transaction Features
- Product scanning with manual entry fallback
- Multi-tender payments (cash, card, gift card, loyalty)
- Split payment support
- Third-party order processing (DoorDash, GrubHub) with separate sales channel tracking
- Manager-approved returns (no time limit)
- Hold/recall orders
- Receipt printing

### Customer Features
- RFID/NFC tap recognition
- Phone/name search
- Zinrelo loyalty integration
- Customer display on transaction

### Product Features
- Barcode scanning with multi-barcode support
- Manual SKU/name search
- Advanced discount management system:
  - **Item-level discounts**: Click cart item to open discount modal
  - **Order-level discounts**: Apply discounts to entire transaction
  - **Automatic case discounts**: 12 bottles wine/liquor 750ml/1L, 6 bottles 1.5L/1.75L
  - **Preapproved discounts**: Military (10%), Senior (5%), Damaged Item, etc.
  - **Employee authorization**: Discount limits with manager approval over threshold
  - **Manager PIN approval**: Required for discounts exceeding employee limits
  - **Full audit trail**: Every discount tracked with employee, reason, and approval
- Linked products (single can ↔ 4-pack)
- Price override with manager approval

### Employee Features
- Employee login/identification with discount authorization levels
- Special employee pricing (cost + round up to nearest dollar)
- Deferred payment tracking
- Separate reporting channel for employee purchases
- **Discount permissions**: Configurable limits per employee
  - Maximum item discount (percent and fixed amount)
  - Maximum order discount (percent and fixed amount)
  - Manager approval required for over-limit discounts
- **Manager capabilities**: PIN approval for employee discount overrides

### Payment Types
- Cash (with change calculation)
- Credit/Debit cards
- Euphoria gift cards
- Zinrelo loyalty points
- Split tender across multiple payment methods
- Third-party (pre-paid but tracked)

### Multi-Lane Features
- 2 checkout lanes with shared inventory
- Near real-time sync between lanes
- Conflict resolution for simultaneous updates

### Backend Integration
- Supabase real-time inventory sync
- Transaction upload for reporting
- Price/discount rule updates from backend
- Product information sync

## Out of Scope - Phase 1

### Not Included (But Planned)
- Advanced reporting/analytics
- AI-powered features
- Inventory receiving/management
- Purchase orders
- Customer communications
- Marketing campaigns
- Advanced promotions beyond case discounts
- Age verification automation

### Handled by Backend System
- Complex discount rules configuration and management
- Employee discount permission settings
- Preapproved discount library management
- Discount analytics and audit reporting
- Inventory reorder points
- Product categorization/tagging
- Pricing updates
- Deal/promotion configuration

## Technical Constraints

### Hardware
- Must run on Mac Mini M2 (8GB RAM minimum)
- Support standard USB peripherals
- Work with existing receipt printers
- Compatible with standard barcode scanners

### Integration Requirements
- Zinrelo API for loyalty
- Supabase for data persistence
- Payment processor API (Stripe/Square)
- Must support future AI agent integration

### Data Integrity
- Every transaction must be atomic
- Inventory updates must be idempotent
- All operations must be auditable
- Must handle network interruptions gracefully

## Transaction Flow Examples

### Standard Sale
1. Scan/add products
2. Apply automatic case discounts
3. Add customer (tap/search)
4. Select payment method(s)
5. Process payment
6. Print receipt
7. Update inventory

### Third-Party Order
1. Select "DoorDash" or "GrubHub" order type
2. Scan/add products
3. Complete order (no payment needed)
4. System records as third-party sales channel
5. Update inventory

### Employee Purchase
1. Employee login
2. Scan/add products
3. System shows employee pricing (cost + round up)
4. Select "Employee Tab" payment
5. Complete transaction
6. Track separately from regular sales

### Return Process
1. Look up original transaction
2. Select items to return
3. Manager approval
4. Process refund to original payment method
5. Update inventory (add back)

## Success Metrics

### Phase 1 Launch (First 30 Days)
- Zero inventory discrepancies
- <1% transaction error rate
- Average checkout time <90 seconds
- 95% uptime during business hours
- Successful migration from Clover

### Long-term (6 months)
- 50% of transactions include customer (loyalty engagement)
- Employee satisfaction score >8/10
- System available for other liquor stores
- Platform ready for AI enhancements

## Data Requirements

### Product Data
- SKU/UPC
- Name
- Category (Wine/Liquor/Beer/etc)
- Size (750ml, 1L, 1.5L, 1.75L)
- Cost
- Retail price
- Current stock level
- Multiple barcodes per product

### Transaction Data
- Transaction ID
- Timestamp
- Lane/Terminal ID
- Cashier ID
- Customer ID (if applicable)
- Line items with quantity and price
- Payment method(s) and amounts
- Sales channel (Regular/Third-party/Employee)
- Total with tax breakdown
- **Discount audit data**:
  - Applied discounts with amounts and types
  - Employee who applied each discount
  - Manager approvals with PIN verification
  - Discount reasons and justifications
  - Timestamp for each discount application

### Customer Data
- Customer ID
- Name
- Phone
- Email
- Zinrelo ID
- Loyalty points balance
- RFID/NFC identifier
- Purchase history reference

### Employee Data
- Employee ID
- Name
- PIN for authentication
- Role (Cashier/Manager/Owner)
- **Discount authorization limits**:
  - Maximum item discount percentage
  - Maximum item discount fixed amount
  - Maximum order discount percentage
  - Maximum order discount fixed amount
  - Manager approval required threshold
- Active status and permissions