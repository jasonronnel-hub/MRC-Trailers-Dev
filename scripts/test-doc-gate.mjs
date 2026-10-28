// The conditional document gate (lib/docs.js) — the cases from Kat's Oct 27
// call and the Oct 28 proposal.
import { docGate, docRequirements } from '../src/lib/docs.js'
let n = 0, bad = 0
const t = (name, cond) => { n++; if (!cond) { bad++; console.log('FAIL', name) } }
const weight = { sales_order: { price_unit: 'per_nt' }, sold_to: { id: 1 }, hauler_party_id: 9 }
const piece = { sales_order: { price_unit: 'flat' }, sold_to: { id: 1 }, hauler_party_id: 9 }
const buyerHauled = { sales_order: { price_unit: 'per_nt' }, sold_to: { id: 1 }, hauler_party_id: 1 }
const noHauler = { sales_order: { price_unit: 'per_nt' }, sold_to: { id: 1 }, hauler_party_id: null }
const all = (u, extra) => ({ ...u, doc_release: 'received', doc_scale_ticket: 'received', doc_hauler_invoice: 'received', ...extra })

t('all received passes', docGate(all(weight)).ok)
t('nothing recorded blocks on all three', docGate(weight).blockers.length === 3)
t('release has no exception', !docRequirements(piece).doc_release.exception && docGate(all(weight, { doc_release: 'na' })).blockers.some((b) => b.key === 'doc_release'))
t('weight sale requires scale ticket', docRequirements(weight).doc_scale_ticket.required)
t('weight sale: scale ticket na is a blocker', docGate(all(weight, { doc_scale_ticket: 'na' })).blockers.some((b) => b.key === 'doc_scale_ticket'))
t('per-piece sale: scale ticket not required', !docRequirements(piece).doc_scale_ticket.required)
t('per-piece sale: unrecorded scale ticket is pending, not ok', (() => { const g = docGate(all(piece, { doc_scale_ticket: null })); return !g.ok && g.pending.length === 1 && g.pending[0].exception.includes('per-piece') })())
t('per-piece sale: recorded exception passes with review line', (() => { const g = docGate(all(piece, { doc_scale_ticket: 'na', doc_scale_ticket_reason: 'bought per piece' })); return g.ok && g.reviews[0].text === 'bought per piece' })())
t('hauler dispatched requires hauler invoice', docRequirements(weight).doc_hauler_invoice.required)
t('buyer hauled: hauler invoice not required', !docRequirements(buyerHauled).doc_hauler_invoice.required && docRequirements(buyerHauled).doc_hauler_invoice.exception.includes('buyer hauled'))
t('no hauler: hauler invoice not required (buyer pickup)', !docRequirements(noHauler).doc_hauler_invoice.required)
t('unpriced unit treated as weight-based', docRequirements({ sold_to: { id: 1 } }).doc_scale_ticket.required)
t('missing is a blocker when required', docGate(all(weight, { doc_release: 'missing' })).blockers[0].text === 'release missing')
console.log(`${n - bad} passed, ${bad} failed`); process.exit(bad ? 1 : 0)
