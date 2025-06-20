import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface SyncPayload {
  messageId: string
  terminalId: string
  topic: string
  data: any
  timestamp: string
  peerAckedAt?: string
}

serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // Parse request body
    const payload: SyncPayload = await req.json()
    const { messageId, terminalId, topic, data, timestamp, peerAckedAt } = payload

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Log the sync event
    console.log(`Processing ${topic} message ${messageId} from terminal ${terminalId}`)

    // Process message based on topic
    switch (topic) {
      case 'transaction': {
        // Insert transaction and related data
        const { transaction, items, payments } = data
        
        // Insert transaction
        const { error: txError } = await supabase
          .from('transactions')
          .insert({
            ...transaction,
            sync_terminal_id: terminalId,
            sync_message_id: messageId
          })
        
        if (txError) throw txError

        // Insert transaction items
        if (items && items.length > 0) {
          const { error: itemsError } = await supabase
            .from('transaction_items')
            .insert(items)
          
          if (itemsError) throw itemsError
        }

        // Insert payments
        if (payments && payments.length > 0) {
          const { error: paymentsError } = await supabase
            .from('payments')
            .insert(payments)
          
          if (paymentsError) throw paymentsError
        }
        
        break
      }

      case 'inventory': {
        // Update inventory levels
        const { productId, currentStock, changeAmount, changeType } = data
        
        // Record inventory change
        const { error: changeError } = await supabase
          .from('inventory_changes')
          .insert({
            ...data,
            sync_terminal_id: terminalId,
            sync_message_id: messageId
          })
        
        if (changeError) throw changeError

        // Update current inventory level
        const { error: invError } = await supabase
          .from('inventory')
          .upsert({
            product_id: productId,
            current_stock: currentStock,
            last_synced_at: new Date().toISOString()
          })
        
        if (invError) throw invError
        
        break
      }

      case 'customer': {
        // Upsert customer data
        const { error: custError } = await supabase
          .from('customers')
          .upsert({
            ...data,
            last_synced_at: new Date().toISOString()
          })
        
        if (custError) throw custError
        
        break
      }

      case 'employee': {
        // Sync employee data
        const { error: empError } = await supabase
          .from('employees')
          .upsert({
            ...data,
            last_synced_at: new Date().toISOString()
          })
        
        if (empError) throw empError
        
        break
      }

      default:
        console.warn(`Unknown message topic: ${topic}`)
    }

    // Record successful sync
    const { error: logError } = await supabase
      .from('sync_log')
      .insert({
        message_id: messageId,
        terminal_id: terminalId,
        topic,
        status: 'success',
        synced_at: new Date().toISOString(),
        peer_acked_at: peerAckedAt
      })

    if (logError) {
      console.error('Failed to log sync event:', logError)
    }

    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId,
        timestamp: new Date().toISOString()
      }), 
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Sync error:', error)
    
    // Try to log the error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const payload = await req.json()
        
        await supabase
          .from('sync_log')
          .insert({
            message_id: payload.messageId,
            terminal_id: payload.terminalId,
            topic: payload.topic,
            status: 'error',
            error_message: error.message,
            synced_at: new Date().toISOString()
          })
      }
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }

    // Return error response
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Unknown error occurred'
      }), 
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})