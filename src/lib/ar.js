// Accounts receivable helpers — overdue visibility first, "lost" by hand.
//
// PROVISIONAL RULES (Jason, Sept 2026): confirm thresholds and escalation
// with Carrie / accounting before cutover. Everything tunable is up top.

export const AR_RULES = {
  // Days past due before an invoice counts as overdue at all. 0 = the day
  // after the due date.
  overdueGraceDays: 0,
  // Buckets for the AR view and the buyer warning.
  buckets: [
    { label: '1–30', min: 1, max: 30 },
    { label: '31–60', min: 31, max: 60 },
    { label: '61–90', min: 61, max: 90 },
    { label: '90+', min: 91, max: Infinity },
  ],
  // Terms with no number ("COD", "CAD", "Advance Payment") are treated as
  // due on the invoice date.
  defaultTermsDays: 30,
}

// "Net 30 Days" → 30, "30 Days from Delivery" → 30, "Net 10th Following" → 10,
// "COD" → 0, "70% on rec wts-bal@finals" → null (unknowable).
export function termsDays(name) {
  if (!name) return null
  const n = String(name)
  if (/^z*cod$|^cad$|advance|upon/i.test(n)) return 0
  const m = n.match(/(\d{1,3})\s*(?:days?|th)?/i)
  if (m) return Number(m[1])
  return null
}

const addDays = (iso, days) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Due date: the invoice's own due_date if set, else invoice_date + terms.
// termsName is the invoice's own terms text, falling back to the buyer's.
export function dueDate(inv, buyerTermsName) {
  if (inv.due_date) return inv.due_date
  if (!inv.invoice_date) return null
  const days = termsDays(inv.terms) ?? termsDays(buyerTermsName) ?? AR_RULES.defaultTermsDays
  return addDays(inv.invoice_date, days)
}

export function daysPastDue(inv, buyerTermsName, today = new Date().toISOString().slice(0, 10)) {
  const due = dueDate(inv, buyerTermsName)
  if (!due) return null
  const ms = new Date(today + 'T00:00:00') - new Date(due + 'T00:00:00')
  return Math.floor(ms / 86400000)
}

// An invoice is overdue when it is open, not disputed, not written off as
// lost, and past its due date by more than the grace period.
export function isOverdue(inv, buyerTermsName) {
  if (!inv.open || inv.lost || inv.disputed) return false
  const d = daysPastDue(inv, buyerTermsName)
  return d != null && d > AR_RULES.overdueGraceDays
}

export const bucketFor = (days) => AR_RULES.buckets.find((b) => days >= b.min && days <= b.max)?.label ?? null

// What a sales user needs to see before selling to a buyer: how many open
// invoices are overdue, for how much, and the oldest.
export function buyerOverdue(invoices, buyerId, buyerTermsName) {
  const mine = invoices.filter((i) => i.buyer?.id === buyerId && isOverdue(i, buyerTermsName))
  if (!mine.length) return null
  const amount = mine.reduce((s, i) => s + Number(i.amount || 0) - Number(i.paid_amount || 0), 0)
  const oldest = Math.max(...mine.map((i) => daysPastDue(i, buyerTermsName) ?? 0))
  return { count: mine.length, amount, oldest }
}

export const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
