/**
 * Re-derive unit statuses for migrated units from the staging facts, using
 * the same deriveStatus() rule as transform.mjs. Updates only units whose
 * status would change. Safe to rerun. Use after a derivation-rule change
 * without replaying the whole transform.
 *
 * Run: node scripts/rom/restatus.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
try { process.loadEnvFile('.env') } catch { /* env may already be set */ }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null }

// Keep in sync with deriveStatus() in transform.mjs.
function deriveStatus(u) {
  if (u.invoiced) return 'Invoiced — Closed'
  if (u.pickup_date || u.completion_date) return 'Delivered — Invoice Required'
  if (u.dispatch_date) return 'Dispatched — Delivery Required'
  if (u.sold_to || u.sales_order) return 'Sold — Dispatch Required'
  if (u.ready) return 'Ready — Sales Required'
  return 'Purchased Not Ready'
}
async function all(table, cols, mod = (q) => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await mod(db.from(table).select(cols)).range(from, from + 999)
    if (error) throw error
    out.push(...data); if (data.length < 1000) return out
  }
}
const { data: statuses } = await db.from('unit_statuses').select('id, name')
const sid = (n) => statuses.find((s) => s.name === n).id
const sname = (id) => statuses.find((s) => s.id === id)?.name
// TJ (Oct 28): suppliers without a ready step (everyone but FedEx Ground)
// have their units Ready the day they're bought. Same rule as transform.mjs.
const readyStep = new Set((await all('parties', 'id', (q) => q.eq('ready_step_required', true))).map((p) => p.id))
const partyByLegacy = new Map((await all('parties', 'id, legacy_dealer_id', (q) => q.not('legacy_dealer_id', 'is', null))).map((p) => [p.legacy_dealer_id, p.id]))
const readyOnPurchase = (legacyDealerId) => { const pid = partyByLegacy.get(int(legacyDealerId)); return pid != null && !readyStep.has(pid) }
const st = await all('staging_units', 'bwt_id, ready_state, purch_dealer_id, sale_invoice_id, sale_dealer_id, sale_order_id, dtl_soid, dispatch_date, pickup_date, completion_date')
const live = await all('units', 'id, legacy_bwt_id, status_id, ready_date, purchase_date', (q) => q.not('legacy_bwt_id', 'is', null).eq('voided', false))
const want = new Map(st.map((u) => [int(u.bwt_id), sid(deriveStatus({
  invoiced: !!int(u.sale_invoice_id), pickup_date: u.pickup_date, completion_date: u.completion_date,
  dispatch_date: u.dispatch_date, sold_to: !!int(u.sale_dealer_id), sales_order: !!(int(u.sale_order_id) || int(u.dtl_soid)),
  ready: int(u.ready_state) === 1 || readyOnPurchase(u.purch_dealer_id),
}))]))
const changes = live.filter((u) => want.has(u.legacy_bwt_id) && want.get(u.legacy_bwt_id) !== u.status_id)
const moves = {}
for (const u of changes) { const k = `${sname(u.status_id)}  →  ${sname(want.get(u.legacy_bwt_id))}`; moves[k] = (moves[k] || 0) + 1 }
console.log(`live migrated units (not voided): ${live.length}, changing: ${changes.length}`)
Object.entries(moves).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(6), k))
const dry = process.argv.includes('--dry-run')
const today = new Date().toISOString().slice(0, 10)
for (const u of dry ? [] : changes) {
  const target = want.get(u.legacy_bwt_id)
  const patch = { status_id: target }
  if (target === sid('Ready — Sales Required') && !u.ready_date) patch.ready_date = u.purchase_date || today
  const { error } = await db.from('units').update(patch).eq('id', u.id)
  if (error) { console.error('update failed', u.id, error.message); process.exit(1) }
}

// ---- Pass 2 (TJ, Oct 28): a live Not Ready unit at a supplier with no ready
// step is a slip — it should be Ready — Sales Required as of its purchase.
// Applies to every unit (migrated or in-app), skipping voided ones.
const notReady = await all('units', 'id, unit_number, source_party_id, purchase_date, ready_date', (q) => q.eq('status_id', sid('Purchased Not Ready')).eq('voided', false))
const flip = notReady.filter((u) => u.source_party_id != null && !readyStep.has(u.source_party_id))
console.log(`pass 2: ${notReady.length} live Not Ready units, ${flip.length} at suppliers with no ready step → Ready — Sales Required`)
if (dry) { console.log('dry run — nothing written'); process.exit(0) }
for (const u of flip) {
  const { error } = await db.from('units').update({ status_id: sid('Ready — Sales Required'), ready_date: u.ready_date || u.purchase_date || today }).eq('id', u.id)
  if (error) { console.error('update failed', u.id, error.message); process.exit(1) }
}
console.log('done')
