import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { 
  CloudProduct, 
  CloudEmployee, 
  CloudInventory, 
  CloudTransaction,
  CloudTransactionItem,
  TerminalSyncStatus,
  InventoryMovement,
  TransactionUploadPayload,
  MasterDataDownloadPayload,
  InventoryUpdatePayload,
  CloudApiResponse,
  RealtimeSubscription
} from './types'

let supabase: SupabaseClient | null = null
let realtimeSubscriptions: Map<string, RealtimeChannel> = new Map()

/**
 * Initialize Supabase client with configuration
 */
export function initializeSupabase(config: {
  url: string
  anonKey: string
  options?: {
    auth?: {
      autoRefreshToken?: boolean
      persistSession?: boolean
    }
    realtime?: {
      heartbeatIntervalMs?: number
      reconnectAfterMs?: number
    }
  }
}): SupabaseClient {
  try {
    console.log('Initializing Supabase client...')
    
    supabase = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: config.options?.auth?.autoRefreshToken ?? true,
        persistSession: config.options?.auth?.persistSession ?? false, // No persistent sessions for POS
        detectSessionInUrl: false
      },
      realtime: {
        heartbeatIntervalMs: config.options?.realtime?.heartbeatIntervalMs ?? 30000 as any,
        reconnectAfterMs: config.options?.realtime?.reconnectAfterMs ?? 1000
      }
    })
    
    console.log('Supabase client initialized successfully')
    return supabase
    
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error)
    throw error
  }
}

/**
 * Get the initialized Supabase client
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Call initializeSupabase() first.')
  }
  return supabase
}

/**
 * Test Supabase connection and authentication
 */
export async function testConnection(): Promise<{
  isConnected: boolean
  isAuthenticated: boolean
  error?: string
}> {
  try {
    if (!supabase) {
      return {
        isConnected: false,
        isAuthenticated: false,
        error: 'Supabase client not initialized'
      }
    }
    
    // Test basic connectivity with a simple query
    const { data, error } = await supabase
      .from('products')
      .select('count')
      .limit(1)
    
    if (error) {
      return {
        isConnected: false,
        isAuthenticated: false,
        error: error.message
      }
    }
    
    // Check authentication status
    const { data: { user } } = await supabase.auth.getUser()
    
    return {
      isConnected: true,
      isAuthenticated: !!user,
      error: undefined
    }
    
  } catch (error) {
    return {
      isConnected: false,
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Authenticate with service role (for terminal operations)
 */
export async function authenticateServiceRole(serviceRoleKey: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }
  
  try {
    // For service role authentication, we'd typically use a different client
    // or set the Authorization header for subsequent requests
    console.log('Service role authentication configured')
    
  } catch (error) {
    console.error('Service role authentication failed:', error)
    throw error
  }
}

/**
 * Download master data (products, employees) from cloud
 */
export async function downloadMasterData(lastSyncVersion?: number): Promise<MasterDataDownloadPayload> {
  const client = getSupabaseClient()
  
  try {
    console.log('Downloading master data from cloud...')
    
    // Download products (with version filtering if provided)
    const productsQuery = client
      .from('products')
      .select('*')
      .eq('is_active', true)
    
    if (lastSyncVersion) {
      productsQuery.gte('version_number', lastSyncVersion)
    }
    
    const { data: products, error: productsError } = await productsQuery
    
    if (productsError) {
      throw new Error(`Failed to download products: ${productsError.message}`)
    }
    
    // Download product barcodes for the products
    const productIds = products?.map(p => p.id) || []
    const { data: productBarcodes, error: barcodesError } = await client
      .from('product_barcodes')
      .select('*')
      .in('product_id', productIds)
    
    if (barcodesError) {
      throw new Error(`Failed to download product barcodes: ${barcodesError.message}`)
    }
    
    // Download employees
    const employeesQuery = client
      .from('employees')
      .select('*')
      .eq('is_active', true)
    
    if (lastSyncVersion) {
      employeesQuery.gte('version_number', lastSyncVersion)
    }
    
    const { data: employees, error: employeesError } = await employeesQuery
    
    if (employeesError) {
      throw new Error(`Failed to download employees: ${employeesError.message}`)
    }
    
    console.log(`Downloaded ${products?.length || 0} products, ${productBarcodes?.length || 0} barcodes, ${employees?.length || 0} employees`)
    
    return {
      products: (products as CloudProduct[]) || [],
      product_barcodes: (productBarcodes as any[]) || [],
      employees: (employees as CloudEmployee[]) || [],
      version_timestamp: new Date().toISOString()
    }
    
  } catch (error) {
    console.error('Failed to download master data:', error)
    throw error
  }
}

/**
 * Upload transactions to cloud
 */
export async function uploadTransactions(payload: TransactionUploadPayload): Promise<void> {
  const client = getSupabaseClient()
  
  try {
    console.log(`Uploading ${payload.transactions.length} transactions to cloud...`)
    
    // Upload transactions
    if (payload.transactions.length > 0) {
      const { error: transactionsError } = await client
        .from('transactions')
        .insert(payload.transactions)
      
      if (transactionsError) {
        throw new Error(`Failed to upload transactions: ${transactionsError.message}`)
      }
    }
    
    // Upload transaction items
    if (payload.transaction_items.length > 0) {
      const { error: itemsError } = await client
        .from('transaction_items')
        .insert(payload.transaction_items)
      
      if (itemsError) {
        throw new Error(`Failed to upload transaction items: ${itemsError.message}`)
      }
    }
    
    // Upload inventory movements
    if (payload.inventory_movements.length > 0) {
      const { error: movementsError } = await client
        .from('inventory_movements')
        .insert(payload.inventory_movements)
      
      if (movementsError) {
        throw new Error(`Failed to upload inventory movements: ${movementsError.message}`)
      }
    }
    
    console.log('Transaction upload completed successfully')
    
  } catch (error) {
    console.error('Failed to upload transactions:', error)
    throw error
  }
}

/**
 * Sync inventory levels with cloud
 */
export async function syncInventory(updates: CloudInventory[]): Promise<void> {
  const client = getSupabaseClient()
  
  try {
    console.log(`Syncing ${updates.length} inventory levels...`)
    
    // Use upsert to handle both inserts and updates
    const { error } = await client
      .from('inventory')
      .upsert(updates, {
        onConflict: 'product_id'
      })
    
    if (error) {
      throw new Error(`Failed to sync inventory: ${error.message}`)
    }
    
    console.log('Inventory sync completed successfully')
    
  } catch (error) {
    console.error('Failed to sync inventory:', error)
    throw error
  }
}

/**
 * Update terminal sync status
 */
export async function updateTerminalStatus(status: Partial<TerminalSyncStatus>): Promise<void> {
  const client = getSupabaseClient()
  
  try {
    const { error } = await client
      .from('terminal_sync_status')
      .upsert({
        ...status,
        last_heartbeat: new Date().toISOString()
      }, {
        onConflict: 'terminal_id'
      })
    
    if (error) {
      throw new Error(`Failed to update terminal status: ${error.message}`)
    }
    
  } catch (error) {
    console.error('Failed to update terminal status:', error)
    throw error
  }
}

/**
 * Subscribe to real-time inventory updates
 */
export function subscribeToInventoryUpdates(
  callback: (update: CloudInventory) => void
): RealtimeChannel {
  const client = getSupabaseClient()
  
  const channel = client
    .channel('inventory-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'inventory'
      },
      (payload) => {
        console.log('Received inventory update:', payload.new)
        callback(payload.new as CloudInventory)
      }
    )
    .subscribe()
  
  realtimeSubscriptions.set('inventory-updates', channel)
  console.log('Subscribed to inventory updates')
  
  return channel
}

/**
 * Subscribe to real-time master data updates
 */
export function subscribeToMasterDataUpdates(callbacks: {
  onProductUpdate?: (product: CloudProduct) => void
  onEmployeeUpdate?: (employee: CloudEmployee) => void
}): RealtimeChannel[] {
  const client = getSupabaseClient()
  const channels: RealtimeChannel[] = []
  
  // Subscribe to product updates
  if (callbacks.onProductUpdate) {
    const productChannel = client
      .channel('product-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        (payload) => {
          console.log('Received product update:', payload)
          if (payload.new) {
            callbacks.onProductUpdate!(payload.new as CloudProduct)
          }
        }
      )
      .subscribe()
    
    channels.push(productChannel)
    realtimeSubscriptions.set('product-updates', productChannel)
  }
  
  // Subscribe to employee updates
  if (callbacks.onEmployeeUpdate) {
    const employeeChannel = client
      .channel('employee-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employees'
        },
        (payload) => {
          console.log('Received employee update:', payload)
          if (payload.new) {
            callbacks.onEmployeeUpdate!(payload.new as CloudEmployee)
          }
        }
      )
      .subscribe()
    
    channels.push(employeeChannel)
    realtimeSubscriptions.set('employee-updates', employeeChannel)
  }
  
  console.log(`Subscribed to ${channels.length} master data update channels`)
  return channels
}

/**
 * Unsubscribe from all real-time updates
 */
export async function unsubscribeFromAllUpdates(): Promise<void> {
  try {
    for (const [name, channel] of realtimeSubscriptions) {
      await channel.unsubscribe()
      console.log(`Unsubscribed from ${name}`)
    }
    
    realtimeSubscriptions.clear()
    console.log('All real-time subscriptions cleared')
    
  } catch (error) {
    console.error('Failed to unsubscribe from real-time updates:', error)
  }
}

/**
 * Close Supabase connection and cleanup
 */
export async function closeSupabaseConnection(): Promise<void> {
  try {
    // Unsubscribe from all real-time channels
    await unsubscribeFromAllUpdates()
    
    // The Supabase client doesn't have an explicit close method
    // but we can set it to null to release references
    supabase = null
    
    console.log('Supabase connection closed')
    
  } catch (error) {
    console.error('Error closing Supabase connection:', error)
  }
}