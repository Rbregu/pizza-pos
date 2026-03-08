import { supabase } from '../lib/supabase';

// Default color palette — cycles through for new categories
const COLOR_PALETTE = [
  { bg:"#FEE2E2", text:"#991B1B" },
  { bg:"#DCFCE7", text:"#14532D" },
  { bg:"#FEF3C7", text:"#92400E" },
  { bg:"#EDE9FE", text:"#4C1D95" },
  { bg:"#DBEAFE", text:"#1E3A8A" },
  { bg:"#FCE7F3", text:"#831843" },
  { bg:"#FFF7ED", text:"#9A3412" },
  { bg:"#F0FDF4", text:"#166534" },
  { bg:"#FDF4FF", text:"#6B21A8" },
  { bg:"#ECFDF5", text:"#065F46" },
];

export function getCategoryColor(key, index = 0) {
  // Stable colors for built-in categories
  const fixed = {
    pizza:   { bg:"#FEE2E2", text:"#991B1B" },
    salad:   { bg:"#DCFCE7", text:"#14532D" },
    grinder: { bg:"#FEF3C7", text:"#92400E" },
    side:    { bg:"#EDE9FE", text:"#4C1D95" },
    soda:    { bg:"#DBEAFE", text:"#1E3A8A" },
  };
  return fixed[key] || COLOR_PALETTE[index % COLOR_PALETTE.length];
}

// ─────────────────────────────────────────────
// Load all categories ordered by sort_order
// ─────────────────────────────────────────────
export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order')
    .order('label');

  if (error) {
    console.error('Error loading categories:', error.message);
    // Return defaults as fallback
    return [
      { key:'pizza',   label:'Pizza',   emoji:'🍕', sortOrder:1 },
      { key:'salad',   label:'Salad',   emoji:'🥗', sortOrder:2 },
      { key:'grinder', label:'Grinder', emoji:'🥪', sortOrder:3 },
      { key:'side',    label:'Side',    emoji:'🍟', sortOrder:4 },
      { key:'soda',    label:'Soda',    emoji:'🥤', sortOrder:5 },
    ];
  }
  return data.map(r => ({ key:r.key, label:r.label, emoji:r.emoji, sortOrder:r.sort_order }));
}

// ─────────────────────────────────────────────
// Add a new category
// ─────────────────────────────────────────────
export async function addCategory({ key, label, emoji, sortOrder = 99 }) {
  const { error } = await supabase
    .from('categories')
    .insert({ key: key.toLowerCase().replace(/\s+/g,'_'), label, emoji: emoji || '🍽️', sort_order: sortOrder });

  if (error) {
    console.error('Error adding category:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ─────────────────────────────────────────────
// Delete a category (only if no products use it)
// ─────────────────────────────────────────────
export async function deleteCategory(key) {
  // Check for existing products
  const { count, error: countErr } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category', key);

  if (countErr) return { success: false, error: countErr.message };
  if (count > 0) return { success: false, error: `Cannot delete — ${count} product${count !== 1 ? 's' : ''} still use this category.` };

  const { error } = await supabase.from('categories').delete().eq('key', key);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
