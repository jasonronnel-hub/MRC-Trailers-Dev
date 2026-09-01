/**
 * Backfill units.physical_location ("City, ST") for migrated units from the
 * raw ROM purchase contact, using the same shortLocation() as transform.mjs.
 * Groups by distinct name+address so it's ~800 updates, not 22k. Rerunnable.
 *
 * Run: node scripts/rom/relocate.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { shortLocation } from '../../src/lib/location.js'
try { process.loadEnvFile('.env') } catch { /* env may already be set */ }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const combos = new Map()
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('units').select('purchase_location, purchase_location_address')
    .not('legacy_bwt_id', 'is', null).not('purchase_location', 'is', null).range(from, from + 999)
  if (error) throw error
  for (const u of data) combos.set(u.purchase_location + ' ' + (u.purchase_location_address ?? ''), u)
  if (data.length < 1000) break
}
for (const u of combos.values()) {
  const loc = shortLocation(u.purchase_location, u.purchase_location_address)
  let q = db.from('units').update({ physical_location: loc }).not('legacy_bwt_id', 'is', null).eq('purchase_location', u.purchase_location)
  q = u.purchase_location_address == null ? q.is('purchase_location_address', null) : q.eq('purchase_location_address', u.purchase_location_address)
  const { error } = await q
  if (error) throw error
}
const { count } = await db.from('units').select('id', { count: 'exact', head: true })
  .not('legacy_bwt_id', 'is', null).not('physical_location', 'is', null)
console.log(`${combos.size} distinct ROM locations applied; ${count} migrated units now have a physical_location`)
