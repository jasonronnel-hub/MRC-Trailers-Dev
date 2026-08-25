/**
 * ROM migration step 3 (Spec §4): staging_* → live tables.
 *
 * Idempotent: every entity upserts on its legacy_* id — rerunning updates
 * rather than duplicates. Crosswalks (scripts/rom/crosswalks/*.csv) map
 * ROM's dirty size/make lookups to the controlled vocabularies; unmapped
 * ids land as NULL and are counted in the validation report.
 *
 * Run: npm run rom:transform
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

try { process.loadEnvFile('.env') } catch { /* env may already be set */ }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const CHUNK = 500
const die = (label, error) => { if (error) { console.error(`${label}: ${error.message}`); process.exit(1) } }
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null }
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null }
const dateOnly = (v) => (v ? v.slice(0, 10) : null)
const cleanVin = (v) => {
  const s = (v || '').trim()
  return !s || /^n\/?a$/i.test(s) || s === '0' ? null : s
}

async function fetchAllRows(table, columns, mod = (q) => q) {
  // PostgREST caps every response at 1000 rows — page through everything
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await mod(db.from(table).select(columns)).range(from, from + 999)
    die(`read ${table}`, error)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

function readCrosswalk(file) {
  const map = new Map() // rom_id -> canonical name or null
  const lines = readFileSync(`scripts/rom/crosswalks/${file}`, 'utf8').split('\n').slice(1)
  for (const line of lines) {
    if (!line.trim()) continue
    const parts = line.split(',')
    const id = int(parts[0])
    const mapTo = (parts[3] || '').trim()
    if (id != null) map.set(id, mapTo || null)
  }
  return map
}

async function upsert(table, rows, onConflict, label) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict })
    die(`${label} upsert @${i}`, error)
  }
  console.log(`${label}: ${rows.length} upserted`)
}

// ROM DealerGroupID → party_groups name (Field Mapping §4)
const GROUP_MAP = { 13: 'Freight', 14: 'HUB', 18: 'Rail Freight', 21: 'Trailer Buyer', 22: 'Trailer Supplier' }
// ROM ReadyState → unit_statuses name (Field Mapping §6; ids run in reverse pipeline order)
const STATUS_MAP = {
  6: 'Purchased Not Ready', 5: 'Ready — Sales Required', 4: 'Sold — Dispatch Required',
  3: 'Dispatched — Delivery Required', 2: 'Delivered — Invoice Required',
  1: 'Invoiced — Closed', 7: 'State Unknown',
}
const TITLE_MAP = { 1: 'Original', 2: 'Bill of Sale' }

// ---------- lookups from the live DB ----------
const [{ data: groups }, { data: statuses }, { data: titles }, { data: equipTypes }] = await Promise.all([
  db.from('party_groups').select('id, name'),
  db.from('unit_statuses').select('id, name'),
  db.from('title_types').select('id, name'),
  db.from('equipment_types').select('id, name'),
])
const groupId = (n) => groups.find((g) => g.name === n)?.id ?? null
const statusIdByName = (n) => statuses.find((s) => s.name === n)?.id
const titleId = (n) => titles.find((t) => t.name === n)?.id ?? null
const equipIdByName = (n) => equipTypes.find((t) => t.name === n)?.id ?? null

const sizeXwalk = readCrosswalk('trailer_sizes.csv')   // rom size id -> equipment type name
const makeXwalk = readCrosswalk('trailer_makes.csv')   // rom make id -> canonical make name

// ---------- 1. parties ----------
const dealers = await fetchAllRows('staging_dealers', '*')
const partyRows = dealers.map((d) => ({
  legacy_dealer_id: int(d.dealer_id),
  name: d.company_name?.trim() || `(unnamed dealer ${d.dealer_id})`,
  group_id: groupId(GROUP_MAP[int(d.group_id)] ?? 'Other'),
  billing_address: d.billing_address, city: d.city, state: d.state, zip: d.zip,
  phone: d.phone1, email: d.email,
  payment_terms: d.payment_terms, credit_limit: num(d.credit_limit),
  general_notes: d.notes, purchase_hot_notes: d.purchase_hot_notes,
  trucking_notes: d.trucking_notes,
  active: d.active !== '0',
})).filter((p) => p.legacy_dealer_id != null)
await upsert('parties', partyRows, 'legacy_dealer_id', 'parties')

const partyIds = await fetchAllRows('parties', 'id, legacy_dealer_id', (q) => q.not('legacy_dealer_id', 'is', null))
const party = new Map(partyIds.map((p) => [p.legacy_dealer_id, p.id]))

// ---------- 2. party_banking (only dealers with any wire/federal data) ----------
const WIRE_KEYS = [
  'wire_benef_bank', 'wire_aba_num', 'wire_bank_credit', 'wire_bank_acct_num',
  'wire_bank_acct_name', 'wire_bank_more_info', 'wire_add_beneficiary',
  'wire_benef_bank_info', 'wire_benef_acct_num', 'wire_benef_acct_name',
  'wire_benef_aba', 'wire_inter_aba', 'wire_inter_acct_num', 'wire_inter_acct_name',
  'wire_inter_bank', 'wire_inter_bank_info',
]
const bankingRows = dealers.flatMap((d) => {
  const pid = party.get(int(d.dealer_id))
  if (!pid) return []
  const wire = {}
  for (const k of WIRE_KEYS) if (d[k]) wire[k] = d[k]
  if (!Object.keys(wire).length && !d.federal_id) return []
  return [{ party_id: pid, wire_details: Object.keys(wire).length ? wire : null, federal_id: d.federal_id || null }]
})
await upsert('party_banking', bankingRows, 'party_id', 'party_banking')

// ---------- 3. contacts ----------
const contacts = await fetchAllRows('staging_contacts', '*')
const contactRows = contacts.map((c) => ({
  legacy_contact_id: int(c.contact_id),
  party_id: party.get(int(c.dealer_id)),
  name: c.contact_name, email: c.email, phone: c.phone1,
  notes: c.notes, trucking_notes: c.trucking_notes,
  is_default: c.is_default === '1', active: c.active !== '0',
})).filter((c) => c.legacy_contact_id != null && c.party_id != null)
await upsert('party_contacts', contactRows, 'legacy_contact_id', 'party_contacts')

// ---------- 4. trailer makes (canonical values from the crosswalk) ----------
const canonicalMakes = [...new Set([...makeXwalk.values()].filter(Boolean))].sort()
await upsert('trailer_makes', canonicalMakes.map((name) => ({ name })), 'name', 'trailer_makes')
const { data: makeRows } = await db.from('trailer_makes').select('id, name')
const makeIdByName = new Map(makeRows.map((m) => [m.name, m.id]))
const makeIdForRom = (romId) => makeIdByName.get(makeXwalk.get(romId) ?? '') ?? null

// ---------- 5. sales orders ----------
const stOrdersRaw = await fetchAllRows('staging_orders', '*')
// ROM's OrderHeader key is (CompanyID, OrderID) — the same OrderID can exist
// in several divisions. Keep one row per OrderID, preferring the trailer
// division (CompanyID 7675).
const byOrderId = new Map()
for (const o of stOrdersRaw) {
  const existing = byOrderId.get(o.order_id)
  if (!existing || o.company_id === '7675') byOrderId.set(o.order_id, o)
}
const stOrders = [...byOrderId.values()]
if (stOrders.length !== stOrdersRaw.length) {
  console.log(`  (${stOrdersRaw.length - stOrders.length} cross-division duplicate order ids collapsed)`)
}
const priceUnit = (wtum) => {
  const w = (wtum || '').toLowerCase()
  if (w.includes('lb')) return 'per_lb'
  if (w.includes('ton') || w === 'nt' || w === 'gt') return 'per_ton'
  return 'flat'
}
const orderRows = stOrders.map((o) => ({
  legacy_order_id: int(o.order_id),
  order_number: `R-${o.order_id}`,          // legacy orders keep a distinct series; never collides with SO- numbers
  buyer_party_id: party.get(int(o.customer_id)),
  customer_reference: o.external_order_num || null,
  item_code: o.item_text || null,
  price: num(o.price), price_unit: priceUnit(o.wtum),
  ref_weight_lbs: int(o.units_ordered),      // Field Mapping §9.2: UnitsOrdered = per-unit reference weight
  header_notes: o.order_notes || null,
  open: !o.closed_date && o.void !== '1',
  closed_at: o.closed_date || null,
})).filter((o) => o.legacy_order_id != null && o.buyer_party_id != null)
await upsert('sales_orders', orderRows, 'legacy_order_id', 'sales_orders')
const skippedOrders = stOrders.length - orderRows.length

const soIds = await fetchAllRows('sales_orders', 'id, legacy_order_id', (q) => q.not('legacy_order_id', 'is', null))
const so = new Map(soIds.map((o) => [o.legacy_order_id, o.id]))

// ---------- 6. units ----------
const stUnits = await fetchAllRows('staging_units', '*')
let soidFallbacks = 0
const unitRows = stUnits.map((u) => {
  const readyState = int(u.ready_state)
  // SaleOrderID=0 means unsold; some completed units carry the sale in BrokerWTDTL.SOID (Field Mapping §9.3)
  let legacySo = int(u.sale_order_id) || null
  if (!legacySo && int(u.dtl_soid)) { legacySo = int(u.dtl_soid); soidFallbacks++ }
  const sizeName = sizeXwalk.get(int(u.size_id)) ?? null
  return {
    legacy_bwt_id: int(u.bwt_id),
    unit_number: u.unit_num || null, alt_unit_number: u.alt_unit_num || null,
    vin: cleanVin(u.vin),
    equipment_type_id: sizeName ? equipIdByName(sizeName) : null,
    make_id: makeIdForRom(int(u.make_id)),
    model_year: int(u.trailer_year) || null,
    status_id: statusIdByName(STATUS_MAP[readyState] ?? 'Purchased Not Ready'),
    source_party_id: party.get(int(u.purch_dealer_id)) ?? null,
    purchase_order_ref: u.purch_cust_ref || null,
    condition_comments: u.ticket_notes || null,
    ready_date: dateOnly(u.ready_date), scheduled_date: dateOnly(u.sched_date),
    dispatch_date: dateOnly(u.dispatch_date), pickup_date: dateOnly(u.pickup_date),
    completion_date: dateOnly(u.completion_date),
    missing: u.mia === '1',
    title_type_id: titleId(TITLE_MAP[int(u.title_type_id)] ?? 'None'),
    title_received: u.title_rec === '1', title_received_date: dateOnly(u.title_rec_date),
    title_sent_date: dateOnly(u.title_sent_date), title_tracking_num: u.title_tracking || null,
    sold_to_party_id: party.get(int(u.sale_dealer_id)) ?? null,
    sales_order_id: legacySo ? (so.get(legacySo) ?? null) : null,
    hauler_party_id: party.get(int(u.hauler_id)) ?? null,
    gross_wt: num(u.gross), tare_wt: num(u.tare), net_wt: num(u.net),
    confirmed_gross: num(u.confirmed_gross), confirmed_tare: num(u.confirmed_tare),
    confirmed_net: num(u.confirmed_net),
    voided: u.void === '1',
  }
}).filter((u) => u.legacy_bwt_id != null)
await upsert('units', unitRows, 'legacy_bwt_id', 'units')
console.log(`  (${soidFallbacks} units resolved sale linkage via BrokerWTDTL.SOID fallback)`)

// ---------- 7. notes ----------
const unitIds = await fetchAllRows('units', 'id, legacy_bwt_id', (q) => q.not('legacy_bwt_id', 'is', null))
const unitByBwt = new Map(unitIds.map((u) => [u.legacy_bwt_id, u.id]))

const stNotes = await fetchAllRows('staging_notes', '*')
// legacy notes have no unique constraint in our schema — delete + reinsert for idempotency
die('wipe legacy notes', (await db.from('notes').delete().not('legacy_note_id', 'is', null)).error)

let unmappedNotes = 0
const noteRows = stNotes.flatMap((n) => {
  let entity_type = null, entity_id = null
  if (n.p_obj_id === '915' && n.p_obj_type_id === '8' && unitByBwt.has(int(n.p_trans_id))) {
    entity_type = 'unit'; entity_id = unitByBwt.get(int(n.p_trans_id))
  } else if (party.has(int(n.dealer_id))) {
    entity_type = 'party'; entity_id = party.get(int(n.dealer_id))
  } else {
    unmappedNotes++; return []
  }
  if (!n.note_text) return []
  return [{
    legacy_note_id: int(n.note_id),
    entity_type, entity_id,
    note_text: n.note_text,
    note_type: n.note_type_desc || null,
    popup: n.popup === '1',
    authored_at: n.created_date || null,
    voided: n.void === '1',
  }]
})
for (let i = 0; i < noteRows.length; i += CHUNK) {
  const { error } = await db.from('notes').insert(noteRows.slice(i, i + CHUNK))
  die(`notes insert @${i}`, error)
}
console.log(`notes: ${noteRows.length} inserted (${unmappedNotes} unmapped — counted in validation)`)
if (skippedOrders) console.log(`⚠︎ ${skippedOrders} staged orders skipped (no resolvable buyer) — see validation`)
console.log('Transform complete. Run npm run rom:validate for the report.')
