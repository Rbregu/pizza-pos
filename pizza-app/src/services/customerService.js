import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// Look up a customer by phone number
// ─────────────────────────────────────────────
export async function lookupCustomer(phone) {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 10) return null

  const { data, error } = await supabase
    .rpc('lookup_customer', { p_phone: cleaned })

  if (error) { console.error('Error looking up customer:', error.message); return null }
  if (!data || data.length === 0) return null
  return mapCustomer(data[0])
}

// ─────────────────────────────────────────────
// Save or update a customer after an order
// Also saves new address to addresses[] array
// ─────────────────────────────────────────────
export async function upsertCustomer(phone, name, address) {
  const cleaned = phone.replace(/\D/g, '')
  if (!cleaned) return null

  // First upsert the basic customer info via existing function
  const { data, error } = await supabase
    .rpc('upsert_customer', {
      p_phone:   cleaned,
      p_name:    name || '',
      p_address: address || '',
    })

  if (error) { console.error('Error saving customer:', error.message); return null }

  // If a new address was provided, add it to the addresses array if not already there
  if (address && address.trim()) {
    await supabase.rpc('add_customer_address', {
      p_phone:   cleaned,
      p_address: address.trim(),
    })
  }

  return data
}

// ─────────────────────────────────────────────
// Get all customers (for manager view)
// ─────────────────────────────────────────────
export async function getAllCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('last_order_at', { ascending: false })

  if (error) { console.error('Error loading customers:', error.message); return [] }
  return data.map(mapCustomer)
}

// ─────────────────────────────────────────────
// Format phone number for display
// 5551234567 → (555) 123-4567
// ─────────────────────────────────────────────
export function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
}

// ─────────────────────────────────────────────
// Helper: map DB row → app customer object
// ─────────────────────────────────────────────
function mapCustomer(row) {
  return {
    id:             row.id,
    phone:          row.phone,
    name:           row.name || '',
    defaultAddress: row.default_address || '',
    addresses:      row.addresses || [],   // ← array of all known addresses
    totalOrders:    row.total_orders || 0,
    totalSpent:     parseFloat(row.total_spent || 0),
    lastOrderAt:    row.last_order_at,
  }
}
