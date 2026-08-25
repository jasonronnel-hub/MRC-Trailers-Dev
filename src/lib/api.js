import { supabase } from './supabase'

// Fetch-everything is fine at seed scale; once ROM's 23k units migrate in,
// switch the rail counts to a grouped RPC and paginate the tables.
export async function fetchAll() {
  const [statuses, units, parties, orders] = await Promise.all([
    supabase.from('unit_statuses').select('id, name, sort_order').order('sort_order'),
    supabase.from('units').select(`
      id, legacy_bwt_id, unit_number, alt_unit_number, vin, model_year,
      purchase_price, pickup_location_code, pickup_address, physical_location,
      condition_comments, ref_weight_lbs, title_received, voided,
      status:unit_statuses ( id, name, sort_order ),
      equipment_type:equipment_types ( name, item_code ),
      title_type:title_types ( name ),
      source:parties!units_source_party_id_fkey ( id, name ),
      sold_to:parties!units_sold_to_party_id_fkey ( id, name ),
      sales_order:sales_orders ( id, order_number, customer_reference )
    `).eq('voided', false).order('id'),
    supabase.from('parties').select(`
      id, name, billing_address, city, state, zip,
      payment_terms, payment_method, credit_limit,
      deduction_model, standard_deductions, destruction_agreement_signed,
      rema_member, merged_parent, general_notes, trucking_notes,
      purchase_hot_notes, active,
      group:party_groups ( id, name ),
      contacts:party_contacts ( id, name, email, phone, is_default, active )
    `).eq('active', true).order('name'),
    supabase.from('sales_orders').select(`
      id, order_number, customer_reference, item_code, price, price_unit,
      ref_weight_lbs, header_notes, detail_notes, open, created_at,
      buyer:parties ( id, name ),
      units ( id, legacy_bwt_id, unit_number, status:unit_statuses ( name ) )
    `).order('id'),
  ])
  for (const r of [statuses, units, parties, orders]) if (r.error) throw r.error
  return { statuses: statuses.data, units: units.data, parties: parties.data, orders: orders.data }
}

export async function fetchMyRole() {
  const { data, error } = await supabase.from('user_roles').select('role').maybeSingle()
  if (error) throw error
  return data?.role ?? null
}

export const DEDUCTION_LABELS = { none: 'No Deductions', standard: 'Standard', variable: 'Variable' }

export function formatPrice(price, unit) {
  if (price == null) return '—'
  const n = Number(price)
  const amount = n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (unit === 'per_lb') return `$${amount} / lb`
  if (unit === 'per_ton') return `$${amount} / ton`
  return `$${amount} flat`
}
