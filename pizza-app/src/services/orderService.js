import { supabase } from '../lib/supabase'
import { upsertCustomer } from './customerService'

// ─────────────────────────────────────────────
// Place a new order — saves order + items + customer
// ─────────────────────────────────────────────
export async function placeOrder({
  fulfillment,
  customerName,
  customerPhone,
  customerAddress,
  notes,
  items,
  subtotal,
  tax,
  total,
  paymentMethod,
  staffName,
}) {
  try {
    // 1. Save or update customer if we have a phone number
    let customerId = null
    if (customerPhone) {
      customerId = await upsertCustomer(
        customerPhone,
        customerName,
        fulfillment === 'delivery' ? customerAddress : ''
      )
    }

    // 2. Save the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        fulfillment,
        customer_name:    customerName || '',
        customer_phone:   customerPhone.replace(/\D/g, '') || '',
        customer_address: fulfillment === 'delivery' ? customerAddress : '',
        notes:            notes || '',
        staff_name:       staffName || '',
        subtotal:         subtotal,
        tax:              tax,
        total:            total,
        payment_method:   paymentMethod,
        status:           'new',
        customer_id:      customerId,
      })
      .select()
      .single()

    if (orderError) throw new Error(orderError.message)

    // 3. Save all order items
    const orderItems = items.map(item => ({
      order_id:        order.id,
      product_id:      item.product.id,
      product_name:    item.product.name,
      product_emoji:   item.product.emoji,
      category:        item.product.category,
      size_label:      item.size?.label || '',
      size_price:      item.size?.price || item.product.price,
      toppings:        item.toppings || [],
      default_toppings:item.defaultToppings || [],
      quantity:        item.qty,
      price:           item.price,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) throw new Error(itemsError.message)

    return {
      success: true,
      orderId: order.id,
      orderNum: `#${order.order_num}`,
    }

  } catch (err) {
    console.error('Error placing order:', err.message)
    return { success: false, error: err.message }
  }
}

// ─────────────────────────────────────────────
// Load all active orders for the board
// Includes all items for each order
// ─────────────────────────────────────────────
export async function getOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error loading orders:', error.message)
    return []
  }

  return data.map(mapOrder)
}

// ─────────────────────────────────────────────
// Update order status on the board
// Optionally save paymentMethod (for pickup orders paid on collection)
// ─────────────────────────────────────────────
export async function updateOrderStatus(orderId, status, paymentMethod = null) {
  const update = { status }
  if (paymentMethod) update.payment_method = paymentMethod

  const { error } = await supabase
    .from('orders')
    .update(update)
    .eq('id', orderId)

  if (error) {
    console.error('Error updating order status:', error.message)
    return false
  }

  return true
}

// ─────────────────────────────────────────────
// Delete an order from the board
// (cascades to order_items automatically)
// ─────────────────────────────────────────────
export async function dismissOrder(orderId) {
  // Soft delete — keeps order in DB for dashboard/reporting
  const { error } = await supabase
    .from('orders')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) {
    console.error('Error dismissing order:', error.message)
    return false
  }

  return true
}

// ─────────────────────────────────────────────
// Subscribe to real-time order updates
// Board auto-updates when any device changes an order
// ─────────────────────────────────────────────
export function subscribeToOrders(onInsert, onUpdate, onDelete) {
  return supabase
    .channel('orders-channel')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      async (payload) => {
        // Load the full order with items
        const { data } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('id', payload.new.id)
          .single()

        if (data) onInsert(mapOrder(data))
      }
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        onUpdate(payload.new.id, payload.new.status)
      }
    )
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'orders' },
      (payload) => {
        onDelete(payload.old.id)
      }
    )
    .subscribe()
}

// ─────────────────────────────────────────────
// Helper: map DB row → app order object
// ─────────────────────────────────────────────
function mapOrder(row) {
  const createdAt = new Date(row.created_at)
  return {
    id:          row.id,
    num:         `#${row.order_num}`,
    fulfillment: row.fulfillment,
    status:      row.status,
    name:        row.customer_name || '',
    phone:       row.customer_phone || '',
    address:     row.customer_address || '',
    notes:       row.notes || '',
    subtotal:    parseFloat(row.subtotal),
    tax:         parseFloat(row.tax),
    total:       parseFloat(row.total),
    paymentMethod: row.payment_method,
    staffName:     row.staff_name || '',
    time:        createdAt,
    timeStr:     createdAt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }),
    items:       (row.order_items || []).map(mapOrderItem),
  }
}

function mapOrderItem(item) {
  return {
    id:      item.id,
    product: {
      id:       item.product_id,
      name:     item.product_name,
      emoji:    item.product_emoji,
      category: item.category,
    },
    size:            item.size_label ? { label: item.size_label, price: parseFloat(item.size_price) } : null,
    toppings:        item.toppings || [],
    defaultToppings: item.default_toppings || [],
    qty:             item.quantity,
    price:           parseFloat(item.price),
  }
}

// ─────────────────────────────────────────────
// Update order items + totals (for edited orders)
// Replaces all items and recalculates totals
// ─────────────────────────────────────────────
export async function updateOrderItems(orderId, { fulfillment, customerName, customerPhone, customerAddress, notes, items, subtotal, tax, total }) {
  try {
    // 1. Update order header
    const { error: orderErr } = await supabase
      .from('orders')
      .update({ fulfillment, customer_name: customerName||'', customer_phone: customerPhone.replace(/\D/g,'')||'', customer_address: fulfillment==='delivery' ? customerAddress : '', notes: notes||'', subtotal, tax, total })
      .eq('id', orderId)
    if (orderErr) throw new Error(orderErr.message)

    // 2. Delete old items
    const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', orderId)
    if (delErr) throw new Error(delErr.message)

    // 3. Insert new items
    const orderItems = items.map(item => ({
      order_id:         orderId,
      product_id:       item.product.id,
      product_name:     item.product.name,
      product_emoji:    item.product.emoji,
      category:         item.product.category,
      size_label:       item.size?.label || '',
      size_price:       item.size?.price || item.product.price,
      toppings:         item.toppings || [],
      default_toppings: item.defaultToppings || [],
      quantity:         item.qty,
      price:            item.price,
    }))
    const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
    if (itemsErr) throw new Error(itemsErr.message)

    return { success: true }
  } catch (err) {
    console.error('Error updating order:', err.message)
    return { success: false, error: err.message }
  }
}
