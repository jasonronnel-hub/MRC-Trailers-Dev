import { supabase } from './supabase'

// Scale architecture (23k+ units after migration):
//   * fetchAll loads only the SMALL data — lookups, parties, orders and
//     dispatches WITHOUT their unit lists (just counts).
//   * Units are always server-filtered + paginated (fetchUnitsPage).
//   * Rail counts come from the unit_status_counts() RPC — global,
//     RLS-respecting, independent of pagination.
//   * Drawers lazy-load their unit lists (fetchOrderUnits /
//     fetchDispatchUnits), same pattern as notes.

export const UNIT_SELECT = `
  id, legacy_bwt_id, unit_number, alt_unit_number, vin, model_year,
  purchase_price, pickup_location_code, pickup_address, physical_location,
  condition_comments, ref_weight_lbs, title_received, title_sent_date, title_tracking_num, voided, missing,
  purchase_location, purchase_location_address, sale_location, sale_cust_ref,
  deliver_wt_ref, purch_ticket_ref, sales_ticket_ref, wt_um, material_type,
  gross_wt, tare_wt, net_wt, confirmed_net,
  status:unit_statuses ( id, name, sort_order ),
  equipment_type:equipment_types ( name, item_code ),
  title_type:title_types ( name ),
  source:parties!units_source_party_id_fkey ( id, name ),
  sold_to:parties!units_sold_to_party_id_fkey ( id, name ),
  sales_order:sales_orders ( id, order_number, customer_reference, price, price_unit ),
  dispatch:dispatches ( id, dispatch_number ),
  invoice:invoices ( id, invoice_number, open )
`

export async function fetchAll() {
  const [statuses, parties, orders, groups, equipTypes, titleTypes, dispatches, invoices] = await Promise.all([
    supabase.from('unit_statuses').select('id, name, sort_order').order('sort_order'),
    supabase.from('parties').select(`
      id, name, billing_address, city, state, zip,
      payment_terms, payment_method, credit_limit,
      deduction_model, standard_deductions, destruction_agreement_signed,
      rema_member, merged_parent, general_notes, trucking_notes,
      purchase_hot_notes, report_recipients, active,
      group:party_groups ( id, name ),
      contacts:party_contacts ( id, name, email, phone, is_default, active )
    `).eq('active', true).order('name').limit(10000),
    supabase.from('sales_orders').select(`
      id, order_number, customer_reference, item_code, price, price_unit,
      ref_weight_lbs, header_notes, detail_notes, open, closed_at, created_at,
      buyer:parties ( id, name, destruction_agreement_signed ),
      units ( count )
    `).order('id', { ascending: false }).limit(10000),
    supabase.from('party_groups').select('id, name').order('name'),
    supabase.from('equipment_types').select('id, name, item_code, default_ref_weight_lbs').eq('active', true).order('name'),
    supabase.from('title_types').select('id, name'),
    supabase.from('dispatches').select(`
      id, dispatch_number, hauler_contact, pickup_location, pickup_address,
      destination_address, scheduled_pickup, delivery_eta, rate, rate_basis,
      notes, cancelled, created_at,
      hauler:parties!dispatches_hauler_party_id_fkey ( id, name, phone, email ),
      destination:parties!dispatches_destination_party_id_fkey ( id, name, billing_address ),
      units ( count )
    `).order('id', { ascending: false }).limit(10000),
    supabase.from('invoices').select(`
      id, legacy_invoice_id, invoice_number, invoice_date, due_date, terms,
      amount, open, paid_date, paid_amount, payment_method, payment_ref,
      notes, voided, created_at,
      disputed, dispute_reason, dispute_amount, disputed_at, dispute_resolved_at,
      buyer:parties ( id, name ),
      units ( count )
    `).eq('voided', false).order('id', { ascending: false }).limit(10000),
  ])
  for (const r of [statuses, parties, orders, groups, equipTypes, titleTypes, dispatches, invoices]) if (r.error) throw r.error
  return {
    statuses: statuses.data, parties: parties.data, orders: orders.data,
    groups: groups.data, equipTypes: equipTypes.data, titleTypes: titleTypes.data,
    dispatches: dispatches.data, invoices: invoices.data,
  }
}

// Global per-status counts for the pipeline rail (voided excluded).
export async function fetchStatusCounts() {
  const { data, error } = await supabase.rpc('unit_status_counts')
  if (error) throw error
  const counts = {}
  for (const row of data) counts[row.status_id] = Number(row.n)
  return counts
}

// The one way units are listed anywhere in the app. All narrowing happens in
// the database; the browser only ever holds one page.
//
// filters: { statusIds?, notStatusIds?, sourceId?, buyerId?, equipTypeId?,
//            q?, missingOnly?, unattachedSO?, unattachedDispatch?, voided? }
// sort:    { col: 'id'|'unit_number'|'physical_location'|'status'|'model_year', dir: 'asc'|'desc' }
export async function fetchUnitsPage({ filters = {}, sort = {}, page = 0, pageSize = 50 } = {}) {
  let q = supabase.from('units').select(UNIT_SELECT, { count: 'exact' })

  q = q.eq('voided', filters.voided === true)
  if (filters.statusIds?.length) q = q.in('status_id', filters.statusIds)
  if (filters.notStatusIds?.length) {
    for (const id of filters.notStatusIds) q = q.neq('status_id', id)
  }
  if (filters.sourceId) q = q.eq('source_party_id', filters.sourceId)
  if (filters.buyerId) q = q.eq('sold_to_party_id', filters.buyerId)
  if (filters.equipTypeId) q = q.eq('equipment_type_id', filters.equipTypeId)
  if (filters.missingOnly) q = q.eq('missing', true)
  if (filters.unattachedSO) q = q.is('sales_order_id', null)
  if (filters.unattachedDispatch) q = q.is('dispatch_id', null)
  if (filters.unattachedInvoice) q = q.is('invoice_id', null)
  if (filters.pickedUpSince) q = q.gte('pickup_date', filters.pickedUpSince)
  if (filters.q?.trim()) {
    const needle = filters.q.trim().replaceAll(',', ' ').replaceAll('%', '')
    q = q.or(['unit_number', 'alt_unit_number', 'vin', 'physical_location']
      .map((c) => `${c}.ilike.%${needle}%`).join(','))
  }

  const SORT_COLS = { id: 'id', unit_number: 'unit_number', physical_location: 'physical_location', status: 'status_id', model_year: 'model_year' }
  const col = SORT_COLS[sort.col]
  if (col) q = q.order(col, { ascending: sort.dir !== 'desc', nullsFirst: false })
  else q = q.order('status_id').order('id')

  const from = page * pageSize
  const { data, count, error } = await q.range(from, from + pageSize - 1)
  if (error) throw error
  return { rows: data, count: count ?? 0 }
}

export async function fetchOrderUnits(orderId) {
  const { data, error } = await supabase.from('units')
    .select(UNIT_SELECT).eq('sales_order_id', orderId).order('id').limit(1000)
  if (error) throw error
  return data
}

export async function fetchDispatchUnits(dispatchId) {
  const { data, error } = await supabase.from('units')
    .select(UNIT_SELECT).eq('dispatch_id', dispatchId).order('id').limit(1000)
  if (error) throw error
  return data
}

// Every non-voided unit still in the active pipeline (everything except
// Invoiced — Closed). Bounded by how the business actually runs (~1-2k),
// which is what makes the Tuesday Report and the assistant selectors safe.
export async function fetchActiveUnits(statuses) {
  const closed = statuses.find((s) => s.name === 'Invoiced — Closed')?.id
  const out = []
  for (let page = 0; ; page++) {
    const { rows } = await fetchUnitsPage({
      filters: { notStatusIds: closed ? [closed] : [] },
      page, pageSize: 1000,
    })
    out.push(...rows)
    if (rows.length < 1000) return out
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

export async function saveContact(fields, id) {
  const q = id
    ? supabase.from('party_contacts').update(fields).eq('id', id)
    : supabase.from('party_contacts').insert(fields)
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

export async function addNote(entityType, entityId, text, popup = false) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('notes')
    .insert({ entity_type: entityType, entity_id: entityId, note_text: text, popup, author: user?.id })
  if (error) throw error
}

// Notes are lazy-loaded per drawer — with 23k migrated units they can't ride
// along in fetchAll. Popup notes are ROM's PopUpNote: must-see warnings that
// surface the moment the record opens.
export async function fetchNotes(entityType, entityId) {
  const { data, error } = await supabase.from('notes')
    .select('id, note_text, note_type, popup, author, authored_at, voided, legacy_note_id')
    .eq('entity_type', entityType).eq('entity_id', entityId)
    .eq('voided', false)
    .order('authored_at', { ascending: false })
  if (error) throw error
  return data
}

export async function voidNote(id) {
  const { error } = await supabase.from('notes').update({ voided: true }).eq('id', id)
  if (error) throw error
}

// Status history for one unit, newest first (names resolved by the caller
// from the statuses lookup).
export async function fetchStatusLog(unitId) {
  const { data, error } = await supabase.from('status_log')
    .select('id, from_status, to_status, changed_by, changed_at, context')
    .eq('unit_id', unitId)
    .order('id', { ascending: false })
  if (error) throw error
  return data
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

// ---- fleet snapshots (supplier fleet summaries — Selena's Friday report) ----

export async function fetchSnapshots() {
  const { data, error } = await supabase.from('fleet_snapshots')
    .select('id, report_date, source_note, total_assets, created_at, supplier:parties ( id, name )')
    .order('report_date', { ascending: false }).limit(500)
  if (error) throw error
  return data
}

export async function fetchSnapshotCells(snapshotId) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('fleet_snapshot_counts')
      .select('equipment_label, model_year, n')
      .eq('snapshot_id', snapshotId).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

export async function saveSnapshot({ supplier_party_id, report_date, source_note, total_assets }, cells) {
  const { data, error } = await supabase.from('fleet_snapshots')
    .insert({ supplier_party_id, report_date, source_note, total_assets })
    .select('id').single()
  if (error) throw error
  for (let i = 0; i < cells.length; i += 500) {
    const chunk = cells.slice(i, i + 500).map((c) => ({ ...c, snapshot_id: data.id }))
    const { error: ce } = await supabase.from('fleet_snapshot_counts').insert(chunk)
    if (ce) throw ce
  }
  return data.id
}

// ---- invoices (Phase 3b strawman — provisional until Katherine's pass) ----

export const nextInvoiceNumber = (invoices) => {
  const max = invoices.reduce((m, i) => {
    const n = /^INV-(\d+)$/.exec(i.invoice_number || '')
    return n && Number(n[1]) > m ? Number(n[1]) : m
  }, 1000)
  return `INV-${max + 1}`
}

export async function saveInvoice(fields, id) {
  const q = id
    ? supabase.from('invoices').update(fields).eq('id', id)
    : supabase.from('invoices').insert(fields)
  const { error } = await q
  if (error) throw error
}

export async function fetchInvoiceUnits(invoiceId) {
  const { data, error } = await supabase.from('units')
    .select(UNIT_SELECT).eq('invoice_id', invoiceId).order('id').limit(1000)
  if (error) throw error
  return data
}

// Attach an EXPLICIT list of unit ids to an invoice. The DB trigger flips
// them to Invoiced — Closed and audit-logs it.
export async function assignUnitsToInvoice(invoiceId, unitIds) {
  if (!unitIds.length) return
  const { error } = await supabase.from('units')
    .update({ invoice_id: invoiceId })
    .in('id', unitIds)
  if (error) throw error
}

export async function markInvoicePaid(id, { paid_date, paid_amount, payment_method, payment_ref }) {
  // Payment received closes the invoice and clears any standing dispute
  // (the flag history stays: disputed_at/dispute_resolved_at remain set).
  const { error } = await supabase.from('invoices')
    .update({
      open: false, paid_date, paid_amount, payment_method, payment_ref,
      disputed: false, dispute_resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

// Katherine flags a payment/deduction discrepancy; TJ works the collection
// (his legwork goes in as ordinary invoice notes). Accounting/admin only.
export async function flagInvoiceDispute(id, { dispute_reason, dispute_amount }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('invoices')
    .update({
      disputed: true, dispute_reason, dispute_amount,
      disputed_at: new Date().toISOString(), disputed_by: user?.id,
      dispute_resolved_at: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function resolveInvoiceDispute(id) {
  const { error } = await supabase.from('invoices')
    .update({ disputed: false, dispute_resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Suggested invoice amount from a unit's SO pricing — a HELPER for Katherine,
// never authoritative (settlement weights/deductions are her Phase 3b domain).
export function suggestedUnitAmount(u) {
  const price = u.sales_order?.price
  const unit = u.sales_order?.price_unit
  if (price == null) return null
  if (unit === 'flat') return Number(price)
  const wt = u.confirmed_net ?? u.net_wt
  if (wt == null) return null
  return unit === 'per_ton' ? (Number(price) * wt) / 2000 : Number(price) * wt
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
  editUnit: ['office', 'sales', 'logistics', 'accounting', 'admin'],
  addNote: ['office', 'sales', 'logistics', 'accounting', 'admin'],
  // Not gatekept to logistics: if Kim's out, TJ or Janet need to keep
  // dispatches moving — same backup-coverage rule as unit intake.
  createDispatch: ['office', 'sales', 'logistics', 'admin'],
  editDispatch: ['office', 'sales', 'logistics', 'admin'],
  createInvoice: ['accounting', 'admin'],
  editInvoice: ['accounting', 'admin'],
  importSnapshot: ['office', 'sales', 'admin'],
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
