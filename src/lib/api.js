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
  gross_wt, tare_wt, net_wt, confirmed_net, tire_count,
  purchase_date, ready_date, sold_date, dispatch_date, completion_date, commodity_code, import_batch,
  purchase_order_ref, purchase_rate, purchase_rate_unit,
  make:trailer_makes ( name ),
  status:unit_statuses ( id, name, sort_order ),
  equipment_type:equipment_types ( name, item_code ),
  title_type:title_types ( name ),
  source:parties!units_source_party_id_fkey ( id, name ),
  sold_to:parties!units_sold_to_party_id_fkey ( id, name ),
  sales_order:sales_orders ( id, order_number, customer_reference, price, price_unit ),
  dispatch:dispatches ( id, dispatch_number, scheduled_pickup, delivery_eta ),
  invoice:invoices ( id, invoice_number, open )
`

// PostgREST caps every response at 1000 rows no matter what .limit() says —
// with real data (3,161 parties, 20,807 invoices) a plain select silently
// returns the first thousand and every buyer picker in the app goes blind
// past the letter K. For the tables the app holds in memory, walk the pages
// until a short one comes back. No count query, one request in flight per
// table — the tables run in parallel with each other, not against themselves.
async function fetchEvery(build) {
  const data = []
  for (let from = 0; ; from += 1000) {
    const r = await build().range(from, from + 999)
    if (r.error) return r
    data.push(...r.data)
    if (r.data.length < 1000) return { data, error: null }
  }
}

async function fetchInvoicesWorkingSet(cols) {
  const base = (o) => supabase.from('invoices').select(cols, o).eq('voided', false).order('id', { ascending: false })
  const [live, paid] = await Promise.all([
    fetchEvery((o) => base(o).or('open.eq.true,disputed.eq.true')),
    base().eq('open', false).eq('disputed', false).range(0, 999),
  ])
  if (live.error) return live
  if (paid.error) return paid
  const data = [...live.data, ...paid.data].sort((a, b) => b.id - a.id)
  return { data, error: null, truncated: paid.data.length === 1000 }
}

export async function fetchAll() {
  const [statuses, parties, orders, groups, equipTypes, titleTypes, dispatches, invoices, paymentTerms, commodityCodes] = await Promise.all([
    supabase.from('unit_statuses').select('id, name, sort_order').order('sort_order'),
    fetchEvery((o) => supabase.from('parties').select(`
      id, name, billing_address, city, state, zip,
      payment_method, credit_limit,
      deduction_model, standard_deductions, destruction_agreement_signed,
      rema_member, merged_parent, general_notes, trucking_notes,
      purchase_hot_notes, report_recipients, active, title_required_with_delivery,
      group:party_groups ( id, name ),
      contacts:party_contacts ( id, name, email, phone, is_default, active ),
      deductions:party_deductions ( id, description, kind, basis, rate ),
      payment_terms:payment_terms ( id, name )
    `, o).eq('active', true).order('name')),
    fetchEvery((o) => supabase.from('sales_orders').select(`
      id, order_number, customer_reference, item_code, price, price_unit,
      ref_weight_lbs, header_notes, detail_notes, open, closed_at, created_at,
      title_required_with_delivery, title_notes,
      payment_terms:payment_terms ( id, name ),
      commodity:commodity_codes ( code, name ),
      deductions:order_deductions ( id, description, kind, basis, rate ),
      buyer:parties ( id, name, destruction_agreement_signed, title_required_with_delivery ),
      units ( count )
    `, o).order('id', { ascending: false })),
    supabase.from('party_groups').select('id, name').order('name'),
    supabase.from('equipment_types').select('id, name, item_code, default_ref_weight_lbs').eq('active', true).order('name'),
    supabase.from('title_types').select('id, name'),
    fetchEvery((o) => supabase.from('dispatches').select(`
      id, dispatch_number, hauler_contact, pickup_location, pickup_address,
      destination_address, scheduled_pickup, delivery_eta, rate, rate_basis,
      notes, cancelled, created_at,
      hauler:parties!dispatches_hauler_party_id_fkey ( id, name, phone, email ),
      destination:parties!dispatches_destination_party_id_fkey ( id, name, billing_address, title_required_with_delivery ),
      units ( count )
    `, o).order('id', { ascending: false })),
    // Invoices: every OPEN or DISPUTED one (Katherine's working set — ~900 of
    // 20,807 on the June backup) plus the most recent 1,000 paid. Loading all
    // 20k into the browser blew the DB statement timeout; older paid history
    // waits for server-side search (backlog #1).
    fetchInvoicesWorkingSet(`
      id, legacy_invoice_id, invoice_number, invoice_date, due_date, terms,
      amount, open, paid_date, paid_amount, payment_method, payment_ref,
      notes, voided, created_at,
      disputed, dispute_reason, dispute_amount, disputed_at, dispute_resolved_at,
      lost, lost_at, lost_reason,
      buyer:parties ( id, name ),
      units ( count )
    `),
    supabase.from('payment_terms').select('id, name, active').order('sort_order'),
    supabase.from('commodity_codes').select('code, name, active').order('code'),
  ])
  for (const r of [statuses, parties, orders, groups, equipTypes, titleTypes, dispatches, invoices, paymentTerms, commodityCodes]) if (r.error) throw r.error
  return {
    statuses: statuses.data, parties: parties.data, orders: orders.data,
    groups: groups.data, equipTypes: equipTypes.data, titleTypes: titleTypes.data,
    dispatches: dispatches.data, invoices: invoices.data, paymentTerms: paymentTerms.data,
    invoicesPaidTruncated: !!invoices.truncated,
    commodityCodes: commodityCodes.data,
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
  // Needs Attention conditions (thresholds live in src/lib/attention.js)
  if (filters.purchasedBefore) q = q.lte('purchase_date', filters.purchasedBefore)
  if (filters.readyBefore) q = q.lte('ready_date', filters.readyBefore)
  if (filters.importedOnly) q = q.not('import_batch', 'is', null)
  if (filters.importBatch) q = q.eq('import_batch', filters.importBatch)
  if (filters.q?.trim()) {
    const needle = filters.q.trim().replaceAll(',', ' ').replaceAll('%', '')
    q = q.or(['unit_number', 'alt_unit_number', 'vin', 'physical_location', 'purchase_location']
      .map((c) => `${c}.ilike.%${needle}%`).join(','))
  }

  const SORT_COLS = {
    id: 'id', unit_number: 'unit_number', physical_location: 'physical_location', status: 'status_id', model_year: 'model_year',
    vin: 'vin', purchase_date: 'purchase_date', ready_date: 'ready_date', sold_date: 'sold_date',
    dispatch_date: 'dispatch_date', completion_date: 'completion_date', commodity_code: 'commodity_code',
  }
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
    ? supabase.from('parties').update(fields).eq('id', id).select('id').single()
    : supabase.from('parties').insert(fields).select('id').single()
  const { data, error } = await q
  if (error) throw error
  return data?.id ?? id
}

export async function saveDeduction(fields, id) {
  const q = id
    ? supabase.from('party_deductions').update(fields).eq('id', id)
    : supabase.from('party_deductions').insert(fields)
  const { error } = await q
  if (error) throw error
}

export async function deleteDeduction(id) {
  const { error } = await supabase.from('party_deductions').delete().eq('id', id)
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
    ? supabase.from('sales_orders').update(fields).eq('id', id).select('id').single()
    : supabase.from('sales_orders').insert(fields).select('id').single()
  const { data, error } = await q
  if (error) throw error
  return data?.id ?? id
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

// One-step sale (TJ's real flow): create the sales order — or reuse an open
// one for the same buyer — and attach an EXPLICIT list of units in the same
// action. The attach trigger fills sold_to, flips status to Sold — Dispatch
// Required, and writes status_log, exactly as the two-screen path does.
export async function sellUnits({ order, orderId, unitIds, deductions = [] }) {
  let id = orderId
  let order_number = null
  if (!id) {
    const { data, error } = await supabase.from('sales_orders').insert(order).select('id, order_number').single()
    if (error) throw error
    id = data.id; order_number = data.order_number
    if (deductions.length) await replaceOrderDeductions(id, deductions)
  }
  await attachUnits(id, unitIds)
  return { id, order_number }
}

// The order's deduction schedule, replaced wholesale (small lists; simpler
// than diffing). Rows: { description, kind, basis, rate }.
export async function replaceOrderDeductions(orderId, rows) {
  const { error: de } = await supabase.from('order_deductions').delete().eq('order_id', orderId)
  if (de) throw de
  const clean = rows.filter((r) => r.description?.trim() && r.rate !== '' && r.rate != null)
    .map((r) => ({ order_id: orderId, description: r.description.trim(), kind: r.kind, basis: r.basis, rate: Number(r.rate) }))
  if (!clean.length) return
  const { error } = await supabase.from('order_deductions').insert(clean)
  if (error) throw error
}

// The same price in every unit the trade quotes in, so a $/GT quote can be
// compared with a $/NT one without a calculator. Weights stay in pounds;
// this only converts the price.
export function priceEquivalents(price, unit) {
  if (price == null || price === '' || unit === 'flat') return null
  const perLb = LB_PER[unit] ? Number(price) / LB_PER[unit] : Number(price)
  return { per_lb: perLb, per_nt: perLb * LB_PER.per_nt, per_gt: perLb * LB_PER.per_gt, per_mt: perLb * LB_PER.per_mt }
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

// The three tons of the scrap trade (weights are always stored in POUNDS;
// these convert only at pricing time). 'per_ton' is the legacy value from
// before the distinction and meant the industry-default net ton.
export const LB_PER = {
  per_nt: 2000,          // net / short ton
  per_gt: 2240,          // gross / long ton
  per_mt: 2204.62262,    // metric tonne
  per_ton: 2000,         // legacy alias
}

// Suggested invoice amount from a unit's SO pricing — a HELPER for Katherine,
// never authoritative (settlement weights/deductions are her Phase 3b domain).
//
// Deduction math (Jason, Aug 2026): weight deductions (lbs, per tire or per
// unit) reduce billable pounds BEFORE pricing; dollar deductions (per tire
// or per unit) subtract AFTER. Per-tire rules need the unit's tire_count —
// if it's missing, per-tire rules are skipped (never guessed).
export function suggestedUnitAmount(u, deductions = []) {
  const price = u.sales_order?.price
  const unit = u.sales_order?.price_unit
  if (price == null) return null
  if (unit === 'flat') return applyDollarDeductions(Number(price), u, deductions)
  let wt = u.confirmed_net ?? u.net_wt
  if (wt == null) return null
  for (const d of deductions) {
    if (d.kind !== 'weight') continue
    if (d.basis === 'per_unit') wt -= Number(d.rate)
    else if (u.tire_count != null) wt -= Number(d.rate) * u.tire_count
  }
  wt = Math.max(0, wt)
  const perLb = LB_PER[unit]
  const gross = perLb ? (Number(price) * wt) / perLb : Number(price) * wt
  return applyDollarDeductions(gross, u, deductions, wt)
}

function applyDollarDeductions(amount, u, deductions, billableLbs = null) {
  for (const d of deductions) {
    if (d.kind !== 'dollars') continue
    if (d.basis === 'per_unit') amount -= Number(d.rate)
    else if (d.basis === 'per_lb') { if (billableLbs != null) amount -= Number(d.rate) * billableLbs }
    else if (u.tire_count != null) amount -= Number(d.rate) * u.tire_count
  }
  return Math.max(0, amount)
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
  markInvoiceLost: ['accounting', 'admin'],
  editOrderDeductions: ['sales', 'accounting', 'admin'],
}
export const can = (role, action) => (CAN[action] || []).includes(role)

export async function fetchMyRole() {
  const { data, error } = await supabase.from('user_roles').select('role').maybeSingle()
  if (error) throw error
  return data?.role ?? null
}

// Lost is an accounting decision, never automatic (Jason). The invoice stays
// open=true so history is intact; `lost` just takes it out of the AR chase.
export async function markInvoiceLost(id, reason) {
  const { error } = await supabase.from('invoices')
    .update({ lost: true, lost_at: new Date().toISOString(), lost_reason: reason || null }).eq('id', id)
  if (error) throw error
}
export async function unmarkInvoiceLost(id) {
  const { error } = await supabase.from('invoices').update({ lost: false, lost_at: null, lost_reason: null }).eq('id', id)
  if (error) throw error
}

// Sum of invoice amounts dated in [from, to]. Small result set; summed here.
export async function fetchInvoicedTotal(from, to) {
  const { data, error } = await supabase.from('invoices').select('amount')
    .eq('voided', false).gte('invoice_date', from).lte('invoice_date', to).limit(5000)
  if (error) throw error
  return { total: data.reduce((s, i) => s + Number(i.amount || 0), 0), count: data.length }
}

export const DEDUCTION_LABELS = { none: 'No Deductions', standard: 'Standard', variable: 'Variable' }

export { unitLocation, shortLocation } from './location'

export function formatPrice(price, unit) {
  if (price == null) return '—'
  const n = Number(price)
  const amount = n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (unit === 'per_lb') return `$${amount} / lb`
  if (unit === 'per_nt' || unit === 'per_ton') return `$${amount} / NT`
  if (unit === 'per_gt') return `$${amount} / GT`
  if (unit === 'per_mt') return `$${amount} / MT`
  return `$${amount} flat`
}
