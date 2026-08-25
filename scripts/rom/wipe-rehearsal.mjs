/**
 * Post-rehearsal cleanup (Spec §1: real data lives only in prod; §4: the
 * extracted files are deleted after each rehearsal).
 *
 * Wipes the staging_* tables AND all live rows, then reseeds the demo data
 * by invoking seed-dev.mjs. Run rom:clean afterwards to delete exports/.
 *
 * Run: npm run rom:wipe
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

try { process.loadEnvFile('.env') } catch { /* env may already be set */ }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

console.log('Wiping staging tables…')
for (const [table, col] of [
  ['staging_units', 'bwt_id'], ['staging_dealers', 'dealer_id'],
  ['staging_contacts', 'contact_id'], ['staging_orders', 'order_id'],
  ['staging_notes', 'note_id'], ['staging_invoices', 'invoice_id'],
]) {
  const { error } = await db.from(table).delete().neq(col, '__never__')
  if (error) { console.error(`${table}: ${error.message}`); process.exit(1) }
}

console.log('Wiping migrated notes…')
{
  const { error } = await db.from('notes').delete().neq('id', -1)
  if (error) { console.error(`notes: ${error.message}`); process.exit(1) }
}

console.log('Reseeding demo data (wipes live units/orders/parties)…')
execFileSync(process.execPath, ['scripts/seed-dev.mjs'], { stdio: 'inherit' })
console.log('Rehearsal wiped. Now run: npm run rom:clean  (deletes exports/)')
