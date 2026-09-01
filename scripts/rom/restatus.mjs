/**
 * Re-derive unit statuses for migrated units from the staging facts, using
 * the same deriveStatus() rule as transform.mjs. Updates only units whose
 * status would change. Safe to rerun. Use after a derivation-rule change
 * without replaying the whole transform.
 *
 * Run: node scripts/rom/restatus.mjs
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
const st = await all('staging_units', 'bwt_id, ready_state, sale_invoice_id, sale_dealer_id, sale_order_id, dtl_soid, dispatch_date, pickup_date, completion_date')
const live = await all('units', 'id, legacy_bwt_id, status_id', (q) => q.not('legacy_bwt_id', 'is', null))
const want = new Map(st.map((u) => [int(u.bwt_id), sid(deriveStatus({
  invoiced: !!int(u.sale_invoice_id), pickup_date: u.pickup_date, completion_date: u.completion_date,
  dispatch_date: u.dispatch_date, sold_to: !!int(u.sale_dealer_id), sales_order: !!(int(u.sale_order_id) || int(u.dtl_soid)),
  ready: int(u.ready_state) === 1,
}))]))
const changes = live.filter((u) => want.has(u.legacy_bwt_id) && want.get(u.legacy_bwt_id) !== u.status_id)
const moves = {}
for (const u of changes) { const k = `${sname(u.status_id)}  →  ${sname(want.get(u.legacy_bwt_id))}`; moves[k] = (moves[k] || 0) + 1 }
console.log(`live migrated units: ${live.length}, changing: ${changes.length}`)
Object.entries(moves).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(6), k))
for (const u of changes) {
  const { error } = await db.from('units').update({ status_id: want.get(u.legacy_bwt_id) }).eq('id', u.id)
  if (error) { console.error('update failed', u.id, error.message); process.exit(1) }
}
console.log('done')
