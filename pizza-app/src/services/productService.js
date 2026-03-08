import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// Load all products from the database
// ─────────────────────────────────────────────
export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('category')
    .order('name')

  if (error) {
    console.error('Error loading products:', error.message)
    return []
  }

  // Map DB snake_case to our app's camelCase
  return data.map(mapProduct)
}

// ─────────────────────────────────────────────
// Add a new product to the database
// ─────────────────────────────────────────────
export async function addProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert({
      category:         product.category,
      name:             product.name,
      emoji:            product.emoji,
      price:            product.price,
      default_toppings: product.defaultToppings || [],
      note:             product.note || '',
    })
    .select()
    .single()

  if (error) {
    console.error('Error adding product:', error.message)
    return null
  }

  return mapProduct(data)
}

// ─────────────────────────────────────────────
// Delete a product from the database
// ─────────────────────────────────────────────
export async function deleteProduct(id) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting product:', error.message)
    return false
  }

  return true
}

// ─────────────────────────────────────────────
// Subscribe to real-time product changes
// (when manager adds/removes on another device)
// ─────────────────────────────────────────────
export function subscribeToProducts(onChange) {
  return supabase
    .channel('products-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
      // Reload all products when anything changes
      getProducts().then(onChange)
    })
    .subscribe()
}

// ─────────────────────────────────────────────
// Helper: map DB row → app product object
// ─────────────────────────────────────────────
function mapProduct(row) {
  return {
    id:              row.id,
    category:        row.category,
    name:            row.name,
    emoji:           row.emoji,
    price:           parseFloat(row.price),
    defaultToppings: row.default_toppings || [],
    note:            row.note || '',
  }
}
