/**
 * RLS verification (Build Spec §7.3): proves party_banking is invisible to
 * non-accounting roles, division-read works, and the attach-to-SO status
 * trigger fires and logs.
 *
 * Run against the DEV project only:  npm run test:rls
 * Needs .env with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Creates throwaway rls-test-* users and rows, and deletes them at the end.
 */
import { createClient } from '@supabase/supabase-js'

try { process.loadEnvFile('.env') } catch { /* env may already be set */ }

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('Missing env — need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const PASSWORD = 'rls-test-' + Math.random().toString(36).slice(2) + 'A1!'
const ROLES = ['admin', 'sales', 'logistics', 'accounting', 'office', 'readonly', null] // null = authenticated but roleless

let pass = 0, fail = 0
const check = (ok, label) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`)
  ok ? pass++ : fail++
}

const users = []        // { role, id, email }
let partyId, soId, unitId

async function setup() {
  console.log('Setting up test users and data…')
  for (const role of ROLES) {
    const email = `rls-test-${role ?? 'norole'}@mrc-test.invalid`
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
    if (error) throw new Error(`createUser ${email}: ${error.message}`)
    users.push({ role, id: data.user.id, email })
    if (role) {
      const { error: e2 } = await admin.from('user_roles').insert({ user_id: data.user.id, role })
      if (e2) throw new Error(`user_roles ${role}: ${e2.message}`)
    }
  }

  const { data: party, error: pe } = await admin.from('parties')
    .insert({ name: 'RLS Test Buyer (delete me)' }).select().single()
  if (pe) throw new Error('seed party: ' + pe.message)
  partyId = party.id

  const { error: be } = await admin.from('party_banking')
    .insert({ party_id: partyId, wire_details: { bank: 'Test Bank', account: '000111222' }, federal_id: '12-3456789' })
  if (be) throw new Error('seed banking: ' + be.message)

  const { data: so, error: se } = await admin.from('sales_orders')
    .insert({ order_number: 'SO-RLS-TEST', buyer_party_id: partyId, price: 0.05, price_unit: 'per_lb' })
    .select().single()
  if (se) throw new Error('seed SO: ' + se.message)
  soId = so.id

  const { data: unit, error: ue } = await admin.from('units')
    .insert({ unit_number: 'RLS-TEST-1' }).select().single()
  if (ue) throw new Error('seed unit: ' + ue.message)
  unitId = unit.id
}

async function signedInClient(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return c
}

async function testBankingVisibility() {
  console.log('\nparty_banking visibility (§3: deny by default, accounting/admin only):')
  for (const u of users) {
    const c = await signedInClient(u.email)
    const { data, error } = await c.from('party_banking').select('*')
    const visible = !error && (data?.length ?? 0) > 0
    const shouldSee = u.role === 'accounting' || u.role === 'admin'
    check(visible === shouldSee,
      `${(u.role ?? 'no-role').padEnd(10)} ${shouldSee ? 'CAN see banking' : 'sees NOTHING'} (rows: ${data?.length ?? 0}${error ? ', err: ' + error.message : ''})`)

    // write attempt: only accounting/admin may update
    const { data: upd } = await c.from('party_banking')
      .update({ federal_id: 'HACKED-' + (u.role ?? 'norole') }).eq('party_id', partyId).select()
    const wrote = (upd?.length ?? 0) > 0
    check(wrote === shouldSee, `${(u.role ?? 'no-role').padEnd(10)} update ${shouldSee ? 'allowed' : 'blocked'}`)
    await c.auth.signOut()
  }

  // anon (never signed in) must see nothing
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: anonData } = await anonClient.from('party_banking').select('*')
  check((anonData?.length ?? 0) === 0, 'anon (signed out) sees NOTHING')
}

async function testDivisionRead() {
  console.log('\nDivision read (roled users see parties/units; roleless see nothing):')
  const sales = await signedInClient('rls-test-sales@mrc-test.invalid')
  const { data: p } = await sales.from('parties').select('id').eq('id', partyId)
  check((p?.length ?? 0) === 1, 'sales can read parties')
  const { data: un } = await sales.from('units').select('id').eq('id', unitId)
  check((un?.length ?? 0) === 1, 'sales can read units')
  await sales.auth.signOut()

  const norole = await signedInClient('rls-test-norole@mrc-test.invalid')
  const { data: p2 } = await norole.from('parties').select('id')
  check((p2?.length ?? 0) === 0, 'authenticated-but-roleless user sees no parties')
  await norole.auth.signOut()
}

async function testStatusAutomation() {
  console.log('\nStatus automation (attach to SO → Sold — Dispatch Required + log):')
  const sales = await signedInClient('rls-test-sales@mrc-test.invalid')
  const { data: upd, error } = await sales.from('units')
    .update({ sales_order_id: soId }).eq('id', unitId).select('status_id, sold_to_party_id').single()
  check(!error, `sales can attach unit to SO${error ? ' (err: ' + error.message + ')' : ''}`)
  if (!error) {
    check(upd.sold_to_party_id === partyId, 'sold_to_party_id auto-filled from SO buyer')
    const { data: st } = await sales.from('unit_statuses').select('name').eq('id', upd.status_id).single()
    check(st?.name === 'Sold — Dispatch Required', `status flipped to "${st?.name}"`)
    const { data: log } = await sales.from('status_log').select('*').eq('unit_id', unitId).order('id', { ascending: false })
    check((log?.length ?? 0) >= 2 && log[0].context?.includes('SO-RLS-TEST'),
      `status_log written with context "${log?.[0]?.context}"`)
  }
  await sales.auth.signOut()
}

async function testDispatchPolicies() {
  console.log('\nDispatch (Spec §3: logistics/admin write; sales cannot):')
  const logistics = await signedInClient('rls-test-logistics@mrc-test.invalid')
  const { data: d, error } = await logistics.from('dispatches')
    .insert({ dispatch_number: 'D-RLS-TEST', hauler_party_id: partyId }).select().single()
  check(!error, `logistics can create a dispatch${error ? ' (err: ' + error.message + ')' : ''}`)
  await logistics.auth.signOut()

  const sales = await signedInClient('rls-test-sales@mrc-test.invalid')
  const { error: se } = await sales.from('dispatches')
    .insert({ dispatch_number: 'D-RLS-NOPE', hauler_party_id: partyId })
  check(!!se, 'sales CANNOT create a dispatch')
  const { data: read } = await sales.from('dispatches').select('id').eq('dispatch_number', 'D-RLS-TEST')
  check((read?.length ?? 0) === 1, 'sales can read dispatches (division read)')
  await sales.auth.signOut()

  if (d?.id) await admin.from('dispatches').delete().eq('id', d.id)
}

async function testInvoicePolicies() {
  console.log('\nInvoices (Spec §3: accounting/admin write; sales cannot; paid state guarded):')
  const acct = await signedInClient('rls-test-accounting@mrc-test.invalid')
  const { data: v, error } = await acct.from('invoices')
    .insert({ invoice_number: 'INV-RLS-TEST', buyer_party_id: partyId, amount: 100, open: true }).select().single()
  check(!error, `accounting can create an invoice${error ? ' (err: ' + error.message + ')' : ''}`)
  await acct.auth.signOut()

  const sales = await signedInClient('rls-test-sales@mrc-test.invalid')
  const { error: se } = await sales.from('invoices')
    .insert({ invoice_number: 'INV-RLS-NOPE', buyer_party_id: partyId })
  check(!!se, 'sales CANNOT create an invoice')
  const { data: upd } = await sales.from('invoices').update({ open: false }).eq('id', v?.id ?? -1).select()
  check((upd?.length ?? 0) === 0, 'sales CANNOT mark an invoice paid')
  const { data: read } = await sales.from('invoices').select('id').eq('invoice_number', 'INV-RLS-TEST')
  check((read?.length ?? 0) === 1, 'sales can read invoices (division read)')
  await sales.auth.signOut()

  if (v?.id) await admin.from('invoices').delete().eq('id', v.id)
}

async function testStagingInvisibility() {
  console.log('\nStaging tables (raw ROM data — invisible to every app role):')
  await admin.from('staging_dealers').insert({ dealer_id: '-999999', company_name: 'RLS TEST ROW' })
  for (const roleName of ['admin', 'accounting', 'logistics']) {
    const c = await signedInClient(`rls-test-${roleName}@mrc-test.invalid`)
    const { data, error } = await c.from('staging_dealers').select('dealer_id').eq('dealer_id', '-999999')
    check((data?.length ?? 0) === 0, `${roleName.padEnd(10)} sees NO staging rows${error ? ' (blocked)' : ''}`)
    await c.auth.signOut()
  }
  await admin.from('staging_dealers').delete().eq('dealer_id', '-999999')
}

async function testNotesPolicies() {
  console.log('\nNotes (division writes own; readonly blocked; author-only edits):')
  const sales = await signedInClient('rls-test-sales@mrc-test.invalid')
  const { data: { user: salesUser } } = await sales.auth.getUser()
  const { data: note, error } = await sales.from('notes')
    .insert({ entity_type: 'unit', entity_id: unitId, note_text: 'rls test note', author: salesUser.id })
    .select().single()
  check(!error, `sales can add a note as themselves${error ? ' (err: ' + error.message + ')' : ''}`)
  const { error: forgeErr } = await sales.from('notes')
    .insert({ entity_type: 'unit', entity_id: unitId, note_text: 'forged', author: users.find((u) => u.role === 'admin').id })
  check(!!forgeErr, 'sales CANNOT forge a note as another author')
  await sales.auth.signOut()

  const ro = await signedInClient('rls-test-readonly@mrc-test.invalid')
  const { data: { user: roUser } } = await ro.auth.getUser()
  const { error: roErr } = await ro.from('notes')
    .insert({ entity_type: 'unit', entity_id: unitId, note_text: 'nope', author: roUser.id })
  check(!!roErr, 'readonly CANNOT add notes')
  const { data: roRead } = await ro.from('notes').select('id').eq('id', note?.id ?? -1)
  check((roRead?.length ?? 0) === 1, 'readonly can still read notes')

  const { data: roEdit } = await ro.from('notes').update({ voided: true }).eq('id', note?.id ?? -1).select()
  check((roEdit?.length ?? 0) === 0, 'readonly cannot void someone else’s note')
  await ro.auth.signOut()

  if (note?.id) await admin.from('notes').delete().eq('id', note.id)
}

async function cleanup() {
  console.log('\nCleaning up…')
  if (unitId) await admin.from('status_log').delete().eq('unit_id', unitId)
  if (unitId) await admin.from('units').delete().eq('id', unitId)
  await admin.from('dispatches').delete().in('dispatch_number', ['D-RLS-TEST', 'D-RLS-NOPE'])
  await admin.from('invoices').delete().in('invoice_number', ['INV-RLS-TEST', 'INV-RLS-NOPE'])
  if (soId) await admin.from('sales_orders').delete().eq('id', soId)
  if (partyId) {
    await admin.from('party_banking').delete().eq('party_id', partyId)
    await admin.from('parties').delete().eq('id', partyId)
  }
  for (const u of users) await admin.auth.admin.deleteUser(u.id)
}

try {
  await setup()
  await testBankingVisibility()
  await testDivisionRead()
  await testStatusAutomation()
  await testDispatchPolicies()
  await testInvoicePolicies()
  await testStagingInvisibility()
  await testNotesPolicies()
} finally {
  await cleanup()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
