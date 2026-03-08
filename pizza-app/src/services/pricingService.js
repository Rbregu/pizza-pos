import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// Default pricing — used as fallback if DB has no row yet
// ─────────────────────────────────────────────────────────────
export const DEFAULT_PRICING = {
  // Pizza: extra topping price per size
  pizza_extra_S:  0.50,
  pizza_extra_M:  0.60,
  pizza_extra_L:  0.75,
  pizza_extra_XL: 1.00,
  // Salad/Grinder flat extra prices
  salad_extra_ing:      0.00,
  salad_extra_dressing: 0.00,
  grinder_extra_ing:    0.00,
};

// ─────────────────────────────────────────────────────────────
// Load all pricing config rows into a flat { id: value } map
// ─────────────────────────────────────────────────────────────
export async function loadPricing() {
  const { data, error } = await supabase
    .from('pricing_config')
    .select('id, value');

  if (error) {
    console.error('Error loading pricing config:', error.message);
    return { ...DEFAULT_PRICING };
  }

  const map = { ...DEFAULT_PRICING };
  data.forEach(row => { map[row.id] = parseFloat(row.value); });
  return map;
}

// ─────────────────────────────────────────────────────────────
// Save a single pricing config value (upsert)
// ─────────────────────────────────────────────────────────────
export async function savePricing(id, value) {
  const { error } = await supabase
    .from('pricing_config')
    .upsert({ id, value: parseFloat(value), updated_at: new Date().toISOString() });

  if (error) {
    console.error('Error saving pricing config:', error.message);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// Save multiple pricing values at once
// ─────────────────────────────────────────────────────────────
export async function savePricingBatch(updates) {
  // updates = { id: value, id: value, ... }
  const rows = Object.entries(updates).map(([id, value]) => ({
    id,
    value: parseFloat(value),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('pricing_config')
    .upsert(rows);

  if (error) {
    console.error('Error saving pricing batch:', error.message);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// Get extra price for a pizza topping based on current size
// ─────────────────────────────────────────────────────────────
export function getPizzaExtraPrice(pricing, sizeLabel) {
  return pricing[`pizza_extra_${sizeLabel}`] ?? 0.50;
}

// ─────────────────────────────────────────────────────────────
// Get premium price for a specific ingredient id (salad/grinder)
// Returns 0 if the ingredient is free
// ─────────────────────────────────────────────────────────────
export function getIngredientPrice(pricing, ingredientId) {
  return pricing[`premium_${ingredientId}`] ?? 0;
}
