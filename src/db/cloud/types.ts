// TypeScript types for cloud PostgreSQL database
// These types match the schema.sql structure for type safety

export type ProductCategory = 'wine' | 'liquor' | 'beer' | 'other'
export type ProductSize = '750ml' | '1L' | '1.5L' | '1.75L' | 'other'
export type TransactionStatus = 'pending' | 'completed' | 'voided' | 'refunded'
export type SalesChannel = 'pos' | 'doordash' | 'grubhub' | 'employee'
export type InventoryChangeType = 'sale' | 'return' | 'adjustment' | 'receive'
export type TerminalStatus = 'online' | 'offline' | 'error'

// Cloud Product (authoritative master data)
export interface CloudProduct {
  id: string // UUID
  sku: string
  name: string
  category: ProductCategory
  size: ProductSize
  cost: number // Stored as DECIMAL, converted to number
  retail_price: number
  parent_product_id?: string
  units_in_parent: number
  loyalty_point_multiplier: number
  is_active: boolean
  created_at: string // ISO timestamp
  updated_at: string // ISO timestamp
  version_number: number
  last_modified_by?: string
}

// Cloud Product Barcode
export interface CloudProductBarcode {
  id: string // UUID
  product_id: string
  barcode: string
  is_primary: boolean
  created_at: string // ISO timestamp
}

// Cloud Employee (authoritative master data)
export interface CloudEmployee {
  id: string // UUID
  employee_code: string
  first_name: string
  last_name: string
  pin_hash: string
  is_active: boolean
  can_override_price: boolean
  can_void_transaction: boolean
  is_manager: boolean
  created_at: string // ISO timestamp
  updated_at: string // ISO timestamp
  version_number: number
}

// Cloud Inventory (real-time sync target)
export interface CloudInventory {
  product_id: string
  current_stock: number
  reserved_stock: number
  last_updated: string // ISO timestamp
  last_synced_from_terminal?: string
  version_number: number
}

// Cloud Transaction (uploaded from terminals)
export interface CloudTransaction {
  id: string // ULID from terminal
  transaction_number: string
  terminal_id: string
  customer_id?: string
  employee_id: string
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  points_earned: number
  points_redeemed: number
  status: TransactionStatus
  sales_channel: SalesChannel
  original_transaction_id?: string
  created_at: string // ISO timestamp from terminal
  completed_at?: string // ISO timestamp
  synced_at: string // ISO timestamp when uploaded
  metadata?: Record<string, any> // JSONB data
}

// Cloud Transaction Item
export interface CloudTransactionItem {
  id: string // ULID from terminal
  transaction_id: string
  product_id: string
  quantity: number
  unit_price: number
  discount_amount: number
  total_price: number
  discount_reason?: string
  points_earned: number
  is_returned: boolean
  returned_at?: string // ISO timestamp
}

// Terminal Sync Status (multi-lane coordination)
export interface TerminalSyncStatus {
  terminal_id: string
  last_transaction_sync?: string // ISO timestamp
  last_inventory_sync?: string // ISO timestamp
  last_master_data_sync?: string // ISO timestamp
  pending_transaction_count: number
  status: TerminalStatus
  last_heartbeat: string // ISO timestamp
  error_message?: string
}

// Inventory Movement (audit trail)
export interface InventoryMovement {
  id: string // UUID
  product_id: string
  terminal_id: string
  change_type: InventoryChangeType
  change_amount: number
  new_stock_level: number
  transaction_id?: string
  transaction_item_id?: string
  employee_id?: string
  notes?: string
  created_at: string // ISO timestamp
}

// Sync operation payloads for data transformation
export interface TransactionUploadPayload {
  transactions: CloudTransaction[]
  transaction_items: CloudTransactionItem[]
  inventory_movements: InventoryMovement[]
}

export interface MasterDataDownloadPayload {
  products: CloudProduct[]
  product_barcodes: CloudProductBarcode[]
  employees: CloudEmployee[]
  version_timestamp: string
}

export interface InventoryUpdatePayload {
  inventory_updates: CloudInventory[]
  movements: InventoryMovement[]
}

// API response wrappers
export interface CloudApiResponse<T> {
  data: T
  error?: string
  timestamp: string
}

export interface CloudApiError {
  error: string
  details?: string
  code?: string
  timestamp: string
}

// Sync metadata for tracking
export interface SyncMetadata {
  operation_id: string
  terminal_id: string
  operation_type: 'upload_transactions' | 'download_master_data' | 'sync_inventory'
  started_at: string
  completed_at?: string
  error?: string
  records_processed: number
}

// Database connection and query helpers
export type CloudQueryResult<T> = {
  data: T[]
  count: number
  error?: string
}

// Supabase-specific types
export interface SupabaseConfig {
  url: string
  anonKey: string
  serviceRoleKey?: string
}

export interface RealtimeSubscription {
  table: string
  event: 'INSERT' | 'UPDATE' | 'DELETE'
  callback: (payload: any) => void
}

// Type guards for runtime validation
export function isCloudProduct(obj: any): obj is CloudProduct {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.sku === 'string' &&
    typeof obj.name === 'string' &&
    ['wine', 'liquor', 'beer', 'other'].includes(obj.category) &&
    typeof obj.cost === 'number' &&
    typeof obj.retail_price === 'number'
  )
}

export function isCloudTransaction(obj: any): obj is CloudTransaction {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.transaction_number === 'string' &&
    typeof obj.terminal_id === 'string' &&
    typeof obj.employee_id === 'string' &&
    typeof obj.total_amount === 'number' &&
    ['pending', 'completed', 'voided', 'refunded'].includes(obj.status)
  )
}

export function isInventoryMovement(obj: any): obj is InventoryMovement {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.product_id === 'string' &&
    typeof obj.terminal_id === 'string' &&
    ['sale', 'return', 'adjustment', 'receive'].includes(obj.change_type) &&
    typeof obj.change_amount === 'number'
  )
}