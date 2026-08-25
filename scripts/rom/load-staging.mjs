/**
 * ROM migration step 2 (Spec §4): load exports/*.psv into the staging_*
 * tables. Truncates staging first, so rerunning is safe. Uses the service
 * key (staging tables have RLS on with no policies — invisible to app users).
 *
 * Run: npm run rom:load
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

try { process.loadEnvFile('.env') } catch { /* env may already be set */ }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const SEP = '|~|'
const CHUNK = 500

// Column manifests — MUST match the SELECT order in extract.sh and the
// staging table definitions in the staging migration.
const FILES = {
  'units.psv': ['staging_units', [
    'bwt_id', 'company_id', 'void', 'unit_num', 'alt_unit_num', 'vin',
    'size_id', 'make_id', 'trailer_year', 'ready_state', 'ready_date', 'sched_date',
    'dispatch_date', 'pickup_date', 'completion_date', 'mia',
    'title_type_id', 'title_rec', 'title_rec_date', 'title_sent_date', 'title_tracking',
    'purch_dealer_id', 'purch_order_id', 'purch_cust_ref',
    'sale_dealer_id', 'sale_order_id', 'sale_cust_ref',
    'hauler_id', 'dispatch_id', 'ticket_notes',
    'gross', 'tare', 'net', 'adj_wt', 'adj_reason',
    'confirmed_gross', 'confirmed_tare', 'confirmed_net', 'dtl_soid',
    'type_inv_id', 'type_item_name', 'material_type',
    'purch_contact_name', 'purch_contact_address', 'sold_contact_name',
    'deliver_to_id', 'deliver_wt_ref',
    'po_id', 'purch_ticket_id', 'sales_ticket_id', 'wt_um',
  ]],
  'dealers.psv': ['staging_dealers', [
    'dealer_id', 'company_name', 'group_id', 'billing_address', 'city', 'state', 'zip',
    'phone1', 'email', 'payment_terms', 'terms_type', 'terms_days', 'credit_limit',
    'notes', 'purchase_hot_notes', 'trucking_notes', 'active', 'federal_id',
    'wire_benef_bank', 'wire_aba_num', 'wire_bank_credit', 'wire_bank_acct_num',
    'wire_bank_acct_name', 'wire_bank_more_info', 'wire_add_beneficiary',
    'wire_benef_bank_info', 'wire_benef_acct_num', 'wire_benef_acct_name',
    'wire_benef_aba', 'wire_inter_aba', 'wire_inter_acct_num', 'wire_inter_acct_name',
    'wire_inter_bank', 'wire_inter_bank_info',
  ]],
  'contacts.psv': ['staging_contacts', [
    'contact_id', 'dealer_id', 'contact_name', 'email', 'phone1',
    'notes', 'trucking_notes', 'is_default', 'active',
  ]],
  'orders.psv': ['staging_orders', [
    'order_id', 'company_id', 'customer_id', 'order_type', 'order_date', 'created_date',
    'external_order_num', 'order_notes', 'terms', 'closed_date', 'void',
    'item_text', 'um_id', 'wtum', 'units_ordered', 'price',
  ]],
  'notes.psv': ['staging_notes', [
    'note_id', 'note_detail_id', 'note_type_id', 'note_type_desc', 'dealer_id',
    'p_obj_company_id', 'p_obj_id', 'p_obj_type_id', 'p_trans_id',
    'object_id', 'object_type_id', 'internal_note', 'popup', 'item_note',
    'created_by', 'created_date', 'edited_date', 'void', 'note_text',
  ]],
}

const decode = (v) => v.replaceAll('\\n', '\n').trim()

let badRows = 0
for (const [file, [table, cols]] of Object.entries(FILES)) {
  let raw
  try { raw = readFileSync(`exports/${file}`, 'utf8') } catch {
    console.error(`exports/${file} missing — run npm run rom:extract first`); process.exit(1)
  }

  // wipe staging table (idempotent reruns) — PostgREST needs a filter, so
  // use one no real row can match
  const { error: wipeErr } = await db.from(table).delete().neq(cols[0], '__never__')
  if (wipeErr) { console.error(`wipe ${table}: ${wipeErr.message}`); process.exit(1) }

  const lines = raw.split('\n').filter((l) => l.trim().length)
  const rows = []
  for (const line of lines) {
    const parts = line.split(SEP)
    if (parts.length !== cols.length) { badRows++; continue }
    const row = {}
    cols.forEach((c, i) => { row[c] = decode(parts[i]) || null })
    rows.push(row)
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from(table).insert(rows.slice(i, i + CHUNK))
    if (error) { console.error(`${table} insert @${i}: ${error.message}`); process.exit(1) }
  }
  console.log(`${table}: ${rows.length} rows loaded (${lines.length - rows.length} malformed skipped)`)
}
if (badRows) console.log(`⚠︎ ${badRows} malformed rows skipped overall — check delimiter collisions if this is large`)
console.log('Staging load complete.')
