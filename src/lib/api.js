import { supabase } from './supabase'

// Fetch-everything is fine at seed scale; once ROM's 23k units migrate in,
// switch the rail counts to a grouped RPC and paginate the tables.
export async function fetchAll() {
  const [statuses, units, parties, orders, groups, equipTypes, titleTypes, dispatches] = await Promise.all([
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
      sales_order:sales_orders ( id, order_number, customer_reference ),
      dispatch:dispatches ( id, dispatch_number )
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
    supabase.from('party_groups').select('id, name').order('name'),
    supabase.from('equipment_types').select('id, name, item_code, default_ref_weight_lbs').eq('active', true).order('name'),
    supabase.from('title_types').select('id, name'),
    supabase.from('dispatches').select(`
      id, dispatch_number, hauler_contact, pickup_location, pickup_address,
      destination_address, scheduled_pickup, delivery_eta, rate, rate_basis,
      notes, cancelled, created_at,
      hauler:parties!dispatches_hauler_party_id_fkey ( id, name, phone, email ),
      destination:parties!dispatches_destination_party_id_fkey ( id, name, billing_address ),
      units ( id, legacy_bwt_id, unit_number, vin,
              status:unit_statuses ( name ),
              equipment_type:equipment_types ( name ),
              sales_order:sales_orders ( order_number, customer_reference ) )
    `).order('id'),
  ])
  for (const r of [statuses, units, parties, orders, groups, equipTypes, titleTypes, dispatches]) if (r.error) throw r.error
  return {
    statuses: statuses.data, units: units.data, parties: parties.data, orders: orders.data,
    groups: groups.data, equipTypes: equipTypes.data, titleTypes: titleTypes.data,
    dispatches: dispatches.data,
  }
}

// ---- mutations --------------------------------------------------------------

export async function saveParty(fields, id) {
  const q = id
    ? supabase.from('parties').update(fields).eq('id', id)
    : supabase.from('parties').insert(fields)
  const { error } = await q
  if (error) throw error
}

export async function saveOrder(fields, id) {
  const q = id
    ? supabase.from('sales_orders').update(fields).eq('id', id)
    : supabase.from('sales_orders').insert(fields)
  const { error } = await q
  if (error) throw error
}

export const nextOrderNumber = (orders) => {
  const max = orders.reduce((m, o) => {
    const n = parseInt((o.order_number || '').replace(/^SO-/, ''), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 1040)
  return `SO-${max + 1}`
}

export async function saveUnit(fields, id) {
  const q = id
    ? supabase.from('units').update(fields).eq('id', id)
    : supabase.from('units').insert(fields)
  const { error } = await q
  if (error) throw error
}

// Bulk unit creation (e.g. the assistant adding several units from one
// message). Each row goes through the normal units table defaults/RLS.
export async function addUnits(rows) {
  if (!rows.length) return
  const { error } = await supabase.from('units').insert(rows)
  if (error) throw error
}

// Status change over an EXPLICIT id list, resolved server-side from a
// structured selector at apply time — never "whatever the view shows"
// (Spec §2.6). The audit trigger logs the change regardless of cause.
export async function setUnitsStatus(unitIds, statusId) {
  if (!unitIds.length) return
  const { error } = await supabase.from('units').update({ status_id: statusId }).in('id', unitIds)
  if (error) throw error
}

export async function addNote(entityType, entityId, text) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('notes')
    .insert({ entity_type: entityType, entity_id: entityId, note_text: text, author: user?.id })
  if (error) throw error
}

// Attach an EXPLICIT list of unit ids to a sales order. The database trigger
// fills sold_to_party_id, flips status to Sold — Dispatch Required, and writes
// status_log. Never call this with "whatever the current view shows".
export async function attachUnits(orderId, unitIds) {
  if (!unitIds.length) return
  const { error } = await supabase.from('units')
    .update({ sales_order_id: orderId })
    .in('id', unitIds)
  if (error) throw error
}

// ---- dispatch (Phase 3 strawman — workflow provisional until Kim's pass) ----

export const nextDispatchNumber = (dispatches) => {
  const max = dispatches.reduce((m, d) => {
    const n = parseInt((d.dispatch_number || '').replace(/^D-/, ''), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 1000)
  return `D-${max + 1}`
}

export async function saveDispatch(fields, id) {
  const q = id
    ? supabase.from('dispatches').update(fields).eq('id', id)
    : supabase.from('dispatches').insert(fields)
  const { error } = await q
  if (error) throw error
}

// Assign an EXPLICIT list of unit ids to a dispatch. The DB trigger fills
// hauler + dispatch_date, flips status to Dispatched — Delivery Required,
// and writes status_log — same pattern as attach-to-SO.
export async function assignUnitsToDispatch(dispatchId, unitIds) {
  if (!unitIds.length) return
  const { error } = await supabase.from('units')
    .update({ dispatch_id: dispatchId })
    .in('id', unitIds)
  if (error) throw error
}

// Mark an EXPLICIT list of units delivered: status + completion date.
// The audit trigger logs the status change.
export async function markUnitsDelivered(unitIds, deliveredStatusId) {
  if (!unitIds.length) return
  const { error } = await supabase.from('units')
    .update({ status_id: deliveredStatusId, completion_date: new Date().toISOString().slice(0, 10) })
    .in('id', unitIds)
  if (error) throw error
}

// Role → capability map, mirroring the Section 3 RLS policies. The database
// enforces this regardless; the UI just avoids offering doomed actions.
const CAN = {
  createParty: ['office', 'admin'],
  editParty: ['office', 'admin', 'sales'],
  createOrder: ['sales', 'admin'],
  editOrder: ['sales', 'admin', 'accounting'],
  attachUnits: ['sales', 'admin'],
  createUnit: ['office', 'sales', 'logistics', 'admin'],
  editUnit: ['sales', 'logistics', 'accounting', 'admin'],
  addNote: ['office', 'sales', 'logistics', 'accounting', 'admin'],
  createDispatch: ['logistics', 'admin'],
  editDispatch: ['logistics', 'admin'],
}
export const can = (role, action) => (CAN[action] || []).includes(role)

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
