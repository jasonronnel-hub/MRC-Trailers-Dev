/**
 * ROM migration step 4 (Spec §4): validation report after every run.
 * Human-review this, fix crosswalks, rerun. Prints to console and writes
 * exports/validation-report.md (aggregate stats only — still gitignored
 * because exports/ holds the raw files).
 *
 * Run: npm run rom:validate
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

try { process.loadEnvFile('.env') } catch { /* env may already be set */ }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const count = async (table, mod = (q) => q) => {
  const { count: c, error } = await mod(db.from(table).select('*', { count: 'exact', head: true }))
  if (error) throw new Error(`${table}: ${error.message}`)
  return c
}

const L = []
const log = (s) => { L.push(s); console.log(s) }

log(`# ROM migration validation — ${new Date().toISOString()}`)
log('')
log('## Row counts (staging → live)')
log('')
log('| entity | staging | live (migrated) |')
log('|---|---|---|')
log(`| units | ${await count('staging_units')} | ${await count('units', (q) => q.not('legacy_bwt_id', 'is', null))} |`)
log(`| dealers → parties | ${await count('staging_dealers')} | ${await count('parties', (q) => q.not('legacy_dealer_id', 'is', null))} |`)
log(`| banking rows | — | ${await count('party_banking')} |`)
log(`| contacts | ${await count('staging_contacts')} | ${await count('party_contacts', (q) => q.not('legacy_contact_id', 'is', null))} |`)
log(`| orders | ${await count('staging_orders')} | ${await count('sales_orders', (q) => q.not('legacy_order_id', 'is', null))} |`)
log(`| notes | ${await count('staging_notes')} | ${await count('notes', (q) => q.not('legacy_note_id', 'is', null))} |`)
log(`| invoices | ${await count('staging_invoices')} | ${await count('invoices', (q) => q.not('legacy_invoice_id', 'is', null))} |`)

log('')
log('## Invoiced vs PAID (invoice headers, migrated)')
log('')
log(`- Invoices OPEN (money not received): ${await count('invoices', (q) => q.eq('open', true).not('legacy_invoice_id', 'is', null))}`)
log(`- Invoices paid/closed: ${await count('invoices', (q) => q.eq('open', false).not('legacy_invoice_id', 'is', null))}`)
log(`- Units linked to an invoice: ${await count('units', (q) => q.not('invoice_id', 'is', null).not('legacy_bwt_id', 'is', null))}`)

log('')
log('## Status distribution (migrated units)')
log('')
const { data: statuses } = await db.from('unit_statuses').select('id, name').order('sort_order')
log('| status | units |')
log('|---|---|')
for (const s of statuses) {
  const c = await count('units', (q) => q.eq('status_id', s.id).not('legacy_bwt_id', 'is', null))
  log(`| ${s.name} | ${c} |`)
}

log('')
log('## Data-quality flags')
log('')
log(`- Units with no source party: ${await count('units', (q) => q.is('source_party_id', null).not('legacy_bwt_id', 'is', null))}`)
log(`- Units with no equipment type (unmapped size crosswalk): ${await count('units', (q) => q.is('equipment_type_id', null).not('legacy_bwt_id', 'is', null))}`)
log(`- Units with no make (unmapped make crosswalk): ${await count('units', (q) => q.is('make_id', null).not('legacy_bwt_id', 'is', null))}`)
log(`- Units sold (sold_to set) but with NO sales order link: ${await count('units', (q) => q.not('sold_to_party_id', 'is', null).is('sales_order_id', null).not('legacy_bwt_id', 'is', null))}`)
log(`- Voided units imported (kept, flagged voided): ${await count('units', (q) => q.eq('voided', true).not('legacy_bwt_id', 'is', null))}`)
log(`- Units missing (MIA): ${await count('units', (q) => q.eq('missing', true).not('legacy_bwt_id', 'is', null))}`)

// VIN duplicates among migrated units
const vins = new Map()
for (let from = 0; ; from += 1000) {
  const { data } = await db.from('units').select('vin').not('vin', 'is', null).not('legacy_bwt_id', 'is', null).range(from, from + 999)
  for (const { vin } of data) vins.set(vin, (vins.get(vin) || 0) + 1)
  if (data.length < 1000) break
}
const dupes = [...vins.entries()].filter(([, n]) => n > 1)
log(`- Duplicate VINs: ${dupes.length} VINs appear on more than one unit${dupes.length ? ` (worst: ${dupes.sort((a, b) => b[1] - a[1])[0][1]} units share one VIN)` : ''}`)

log('')
log('Review this report, fix crosswalks (scripts/rom/crosswalks/*.csv), and rerun the pipeline.')

mkdirSync('exports', { recursive: true })
writeFileSync('exports/validation-report.md', L.join('\n'))
console.log('\nWritten to exports/validation-report.md')
