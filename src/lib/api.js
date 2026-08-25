import { supabase } from './supabase'

// Fetch-everything is fine at seed scale; once ROM's 23k units migrate in,
// switch the rail counts to a grouped RPC and paginate the table.
export async function fetchInventory() {
  const [statuses, units] = await Promise.all([
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
  ])
  if (statuses.error) throw statuses.error
  if (units.error) throw units.error
  return { statuses: statuses.data, units: units.data }
}

export async function fetchMyRole() {
  const { data, error } = await supabase.from('user_roles').select('role').maybeSingle()
  if (error) throw error
  return data?.role ?? null
}
