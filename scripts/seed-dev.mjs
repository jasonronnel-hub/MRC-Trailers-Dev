/**
 * DEV-ONLY seed: loads the prototype's fictional demo data into the dev
 * Supabase project so screens 1–2 can be built against realistic data
 * (Spec §7.4). Wipes existing units/orders/parties first — never point
 * this at prod.
 *
 * Run: node scripts/seed-dev.mjs
 */
import { createClient } from '@supabase/supabase-js'

try { process.loadEnvFile('.env') } catch { /* env may already be set */ }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const die = (label, error) => { if (error) { console.error(label + ':', error.message); process.exit(1) } }

// ---- wipe (FK order) --------------------------------------------------------
console.log('Wiping existing demo data…')
const WIPE = [['notes', 'id'], ['status_log', 'id'], ['units', 'id'], ['dispatches', 'id'],
  ['invoices', 'id'], ['sales_orders', 'id'], ['fleet_snapshot_counts', 'id'],
  ['fleet_snapshots', 'id'], ['party_banking', 'party_id'],
  ['party_deductions', 'id'], ['party_contacts', 'id'], ['parties', 'id']]
for (const [t, pk] of WIPE) {
  const { error } = await db.from(t).delete().neq(pk, -1)
  die(`wipe ${t}`, error)
}

// ---- lookups ----------------------------------------------------------------
const [{ data: groups }, { data: equips }, { data: statuses }, { data: titles }, { data: terms }] = await Promise.all([
  db.from('party_groups').select('id, name'),
  db.from('equipment_types').select('id, name'),
  db.from('unit_statuses').select('id, name'),
  db.from('title_types').select('id, name'),
  db.from('payment_terms').select('id, name'),
])
const groupId = (n) => groups.find((g) => g.name === n)?.id
const equipId = (n) => equips.find((e) => e.name === n)?.id
const statusId = (n) => statuses.find((s) => s.name === n)?.id
const titleId = (n) => titles.find((t) => t.name === n)?.id
const termsId = (n) => terms.find((t) => t.name === n)?.id

// ---- parties ----------------------------------------------------------------
console.log('Seeding parties…')
const SUPPLIERS = ['FedEx Ground', 'Walmart', 'Union Pacific', 'Hub Group', 'JB Hunt', 'Milestone']
const buyers = [
  { name: 'SA Recycling', group: 'Trailer Buyer', billing_address: 'Anaheim, CA', payment_terms: 'Net 30 Days', payment_method: 'ACH', deduction_model: 'none', standard_deductions: 'None — blended price', destruction_agreement_signed: '2025-03-14', rema_member: true, general_notes: 'Blended price, no deductions. ANY deduction on their ticket is a mistake — call TJ.', contact: { name: 'Mike Delgado', email: 'scale@sarecycling.example' } },
  { name: 'Sims Metal Management', group: 'Trailer Buyer', billing_address: 'Richmond, VA (central billing)', payment_terms: 'Net 30 Days', payment_method: 'Check', deduction_model: 'standard', standard_deductions: 'Wood floor 2,000 lb; tires $10/ea', deductions: [{ description: 'Wood floor', kind: 'weight', basis: 'per_unit', rate: 2000 }, { description: 'Tires', kind: 'dollars', basis: 'per_tire', rate: 10 }], destruction_agreement_signed: '2024-11-02', rema_member: true, merged_parent: true, general_notes: 'MERGED account. Set Sims as Sold-To; put the actual yard in Sales Location.', contact: { name: 'AR Dept', email: 'ap@simsmm.example' } },
  { name: 'Pacific Steel & Recycling', group: 'Trailer Buyer', billing_address: 'Great Falls, MT', payment_terms: 'Net 30 Days', payment_method: 'ACH', deduction_model: 'standard', standard_deductions: 'Wood floor 2,500 lb', deductions: [{ description: 'Wood floor', kind: 'weight', basis: 'per_unit', rate: 2500 }], destruction_agreement_signed: '2025-06-20', rema_member: true, general_notes: 'Strong long-standing relationship. Bozeman haul is tight on freight.', contact: { name: 'Sam Wilson', email: 'sam@pacificsteel.example' } },
  { name: 'Clark Iron & Metal', group: 'Trailer Buyer', billing_address: 'Murfreesboro, TN', payment_terms: 'COD', payment_method: 'Check', deduction_model: 'variable', general_notes: 'NEW yard, cold-called. No destruction agreement on file — do NOT ship FedEx/Walmart until signed.', contact: { name: 'front desk' } },
  { name: 'Western Metals', group: 'Trailer Buyer', billing_address: 'Salt Lake City, UT', payment_terms: 'Net 30 Days', payment_method: 'ACH', deduction_model: 'standard', standard_deductions: 'Wood floor 2,000 lb', deductions: [{ description: 'Wood floor', kind: 'weight', basis: 'per_unit', rate: 2000 }], destruction_agreement_signed: '2025-01-09', rema_member: true, contact: { name: 'RJ', email: 'rj@westernmetals.example' } },
  { name: 'Nashville Heavy Haul', group: 'Freight', billing_address: 'Nashville, TN', payment_terms: 'Net 15 Days', payment_method: 'ACH', general_notes: 'Hauler. Good for TN/KY single-unit tows.', trucking_notes: 'Good for TN/KY single-unit tows.', contact: { name: 'dispatch', email: 'dispatch@nhh.example' } },
]

const partyIds = {}
for (const name of SUPPLIERS) {
  const { data, error } = await db.from('parties')
    .insert({ name, group_id: groupId('Trailer Supplier') }).select('id').single()
  die(`supplier ${name}`, error)
  partyIds[name] = data.id
}
for (const b of buyers) {
  const { contact, deductions, group, payment_terms, ...fields } = b
  const { data, error } = await db.from('parties')
    .insert({ ...fields, group_id: groupId(group), payment_terms_id: termsId(payment_terms) }).select('id').single()
  die(`buyer ${b.name}`, error)
  partyIds[b.name] = data.id
  if (contact) {
    const { error: ce } = await db.from('party_contacts')
      .insert({ party_id: data.id, is_default: true, ...contact })
    die(`contact for ${b.name}`, ce)
  }
  if (deductions) {
    const { error: de } = await db.from('party_deductions')
      .insert(deductions.map((d) => ({ ...d, party_id: data.id })))
    die(`deductions for ${b.name}`, de)
  }
}

// ---- sales orders -----------------------------------------------------------
console.log('Seeding sales orders…')
const orders = [
  { order_number: 'SO-1041', buyer: 'SA Recycling', customer_reference: 'AUG 26', item_code: '7054-53SR', price: 0.17, price_unit: 'per_lb', ref_weight_lbs: 8500, header_notes: 'No deductions — blended price per SA email 8/12 3:14pm.' },
  { order_number: 'SO-1042', buyer: 'Pacific Steel & Recycling', customer_reference: 'AUG 26', item_code: '7753-53ALCON', price: 190, price_unit: 'per_gt', ref_weight_lbs: 10000, header_notes: 'Std deduction: none on aluminum containers. Confirmed 8/10.' },
]
const orderIds = {}
for (const o of orders) {
  const { buyer, ...fields } = o
  const { data, error } = await db.from('sales_orders')
    .insert({ ...fields, buyer_party_id: partyIds[buyer] }).select('id').single()
  die(`order ${o.order_number}`, error)
  orderIds[o.order_number] = data.id
}

// ---- units ------------------------------------------------------------------
console.log('Seeding units…')
// Demo units carry NO legacy_bwt_id: those ids belong to real ROM tickets,
// and the migration upserts on them — fake ones could collide (found in the
// first rehearsal: real BWT ids live in the same 70xxx range).
const U = (o) => ({
  status_id: statusId(o.status ?? 'Purchased Not Ready'),
  equipment_type_id: equipId(o.equip),
  source_party_id: partyIds[o.source],
  title_type_id: titleId(o.title ?? 'Original'),
  unit_number: o.unit, vin: o.vin,
  physical_location: o.loc, purchase_price: o.price,
  pickup_location_code: o.code, pickup_address: o.addr,
  condition_comments: o.comments, ref_weight_lbs: o.wt,
  sold_to_party_id: o.soldTo ? partyIds[o.soldTo] : null,
  sales_order_id: o.so ? orderIds[o.so] : null,
})
const units = [
  U({ unit: 'FDX-2841', vin: 'DEMO0FEDEX0001', source: 'FedEx Ground', equip: 'Drop Frame Pup', loc: 'Belleville, MI', status: 'Ready — Sales Required', price: 900, code: '493', wt: 8500 }),
  U({ unit: 'FDX-2844', vin: 'DEMO0FEDEX0002', source: 'FedEx Ground', equip: 'Drop Frame Pup', loc: 'Belleville, MI', status: 'Ready — Sales Required', price: 900, code: '493', wt: 8500 }),
  U({ unit: 'FDX-3102', vin: 'DEMO0FEDEX0003', source: 'FedEx Ground', equip: 'Drop Frame Pup', loc: 'Grove City, OH', price: 900, code: '512', wt: 8500 }),
  U({ unit: 'FDX-7781', vin: 'DEMO0FEDEX0004', source: 'FedEx Ground', equip: 'Switcher', loc: 'Kansas City, MO', status: 'Ready — Sales Required', price: 650, title: 'Bill of Sale', wt: 9000 }),
  U({ unit: 'FDX-DLY-55', vin: 'DEMO0FEDEX0005', source: 'FedEx Ground', equip: 'Converter Dolly', loc: 'Murfreesboro, TN', status: 'Ready — Sales Required', price: 120, comments: 'Orphan dolly, remote. GPS may be attached — verify removed.', wt: 2200 }),
  U({ unit: 'WMT-61457', vin: 'DEMO0WMT00001', source: 'Walmart', equip: 'Long Straight Rail', loc: 'Rockwall, TX', price: 1033, code: '3530', addr: '850 W Rusk St, Rockwall, TX', comments: 'Tires a bit worn but ok; door closes.', wt: 10000 }),
  U({ unit: 'WMT-58204', vin: 'DEMO0WMT00002', source: 'Walmart', equip: 'Long Straight Rail', loc: 'Bethlehem, PA', price: 608, code: '7356', addr: '3215 Commerce Center Blvd, Bethlehem, PA', comments: 'Hole in floor; roll-up door damaged.', wt: 10000 }),
  U({ unit: 'WMT-45021', vin: 'DEMO0WMT00003', source: 'Walmart', equip: 'Long Straight Rail', loc: 'Fort Worth, TX', price: 700, comments: '45ft — likely ALL STEEL. Verify VIN; price ~10¢/lb not 17¢.', wt: 10000 }),
  U({ unit: 'UP-CN-8890', vin: 'DEMO0UP000001', source: 'Union Pacific', equip: 'Aluminum Container', loc: 'LA Basin, CA', status: 'Ready — Sales Required', price: 820, wt: 10000 }),
  U({ unit: 'UP-CN-8891', vin: 'DEMO0UP000002', source: 'Union Pacific', equip: 'Steel Container', loc: 'LA Basin, CA', price: 540, wt: 10400 }),
  U({ unit: 'HUB-4471', vin: 'DEMO0HUB00001', source: 'Hub Group', equip: 'Steel Container', loc: 'Chicago, IL', status: 'Ready — Sales Required', price: 560, wt: 10400 }),
  U({ unit: 'FDX-2790', vin: 'DEMO0FEDEX0006', source: 'FedEx Ground', equip: 'Long Straight Rail', loc: 'Harrisburg, PA', status: 'Sold — Dispatch Required', price: 700, wt: 10000, soldTo: 'SA Recycling', so: 'SO-1041' }),
  U({ unit: 'FDX-2795', vin: 'DEMO0FEDEX0007', source: 'FedEx Ground', equip: 'Drop Frame Pup', loc: 'Anaheim, CA', status: 'Dispatched — Delivery Required', price: 900, wt: 8500, soldTo: 'SA Recycling', so: 'SO-1041' }),
  U({ unit: 'FDX-2610', vin: 'DEMO0FEDEX0008', source: 'FedEx Ground', equip: 'Drop Frame Pup', loc: 'Anaheim, CA', status: 'Delivered — Invoice Required', price: 900, wt: 8500, soldTo: 'SA Recycling', so: 'SO-1041' }),
  U({ unit: 'FDX-2601', vin: 'DEMO0FEDEX0009', source: 'FedEx Ground', equip: 'Drop Frame Pup', loc: 'Anaheim, CA', status: 'Delivered — Invoice Required', price: 900, wt: 8500, soldTo: 'SA Recycling', so: 'SO-1041' }),
]
const { error: ue } = await db.from('units').insert(units)
die('units', ue)

// One open invoice with FDX-2601 attached — completes the 6-stage pipeline
// demo (the attach trigger flips it to Invoiced — Closed; the invoice stays
// OPEN because invoiced ≠ paid).
console.log('Seeding invoice…')
const { data: invRow, error: ie } = await db.from('invoices').insert({
  invoice_number: 'INV-1001', buyer_party_id: partyIds['SA Recycling'],
  invoice_date: '2026-08-20', due_date: '2026-09-19', terms: 'Net 30',
  amount: 1445.00, open: true,
  notes: 'Demo invoice — 8,500 lb @ $0.17/lb.',
}).select('id').single()
die('invoice', ie)
const { data: invUnit } = await db.from('units').select('id').eq('unit_number', 'FDX-2601').single()
die('attach to invoice', (await db.from('units').update({ invoice_id: invRow.id }).eq('id', invUnit.id)).error)

const { count } = await db.from('units').select('*', { count: 'exact', head: true })
console.log(`Done. ${count} units, ${orders.length} sales orders, ${SUPPLIERS.length + buyers.length} parties.`)
