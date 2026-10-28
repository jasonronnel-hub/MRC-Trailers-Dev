// Kat's three documents before an invoice goes out: scale ticket, hauler
// invoice, release form. ROM never enforced them. Here the gate is
// CONDITIONAL (proposed Oct 28, to validate with Kat):
//   release        — always required, no exception.
//   scale ticket   — required when the sale is priced by weight; a per-piece
//                    (flat) sale may record an exception instead.
//   hauler invoice — required when a hauler charge applies (a hauler other
//                    than the buyer was dispatched); buyer pickup / fleet
//                    delivering on its own price may record an exception.
// An exception is doc_* = 'na' WITH a reason. Nothing is skipped silently.

export const DOC_KEYS = ['doc_scale_ticket', 'doc_hauler_invoice', 'doc_release']
export const DOC_LABELS = { doc_scale_ticket: 'scale ticket', doc_hauler_invoice: 'hauler invoice', doc_release: 'release' }

// Per document: whether this unit needs it and, if not, the suggested
// exception wording shown for review.
export function docRequirements(u) {
  const unit = u.sales_order?.price_unit
  const weightBased = unit ? unit !== 'flat' : true          // unpriced: assume weight until a price says otherwise
  const haulerId = u.hauler_party_id ?? u.dispatch?.hauler?.id ?? null
  const buyerId = u.sold_to?.id ?? u.sold_to_party_id ?? null
  const haulerIsBuyer = haulerId != null && buyerId != null && String(haulerId) === String(buyerId)
  const haulerCharge = haulerId != null && !haulerIsBuyer
  return {
    doc_release: { required: true, why: 'signed by the fleet when the unit left the yard', exception: null },
    doc_scale_ticket: weightBased
      ? { required: true, why: 'weight-based sale', exception: null }
      : { required: false, why: 'per-piece sale', exception: 'No scale ticket — per-piece sale' },
    doc_hauler_invoice: haulerCharge
      ? { required: true, why: 'a hauler was dispatched', exception: null }
      : { required: false, why: haulerIsBuyer ? 'buyer hauled' : 'no hauler dispatched', exception: haulerIsBuyer ? 'No hauler invoice — buyer hauled' : 'No hauler invoice — buyer pickup / self-delivery' },
  }
}

// What stands between this unit and an invoice.
//   blockers: [{ key, label, text }]  — must be cleared before invoicing
//   reviews:  [{ key, label, text }]  — recorded exceptions, shown for review
//   pending:  [{ key, label, exception }] — not required, but the exception
//             hasn't been recorded yet (one click in the invoice step)
export function docGate(u) {
  const req = docRequirements(u)
  const blockers = [], reviews = [], pending = []
  for (const key of DOC_KEYS) {
    const state = u[key] || null
    const label = DOC_LABELS[key]
    const reason = u[`${key}_reason`]
    if (state === 'received') continue
    if (req[key].required) {
      blockers.push({ key, label, text: state === 'na' ? `${label} required (${req[key].why}) — exception not allowed` : state === 'missing' ? `${label} missing` : `${label} not recorded` })
    } else if (state === 'na') {
      reviews.push({ key, label, text: reason || req[key].exception })
    } else {
      pending.push({ key, label, exception: req[key].exception, state })
    }
  }
  return { blockers, reviews, pending, ok: blockers.length === 0 && pending.length === 0 }
}

// Explicitly recorded as missing (any of the three) — the Needs Attention
// signal. Unrecorded docs are not flagged there: the gate catches them at
// invoice time without flooding the queue with every delivered unit.
export const docsMissing = (u) => DOC_KEYS.filter((k) => u[k] === 'missing')
