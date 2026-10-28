// Pricing math, kept free of the database client so it can be unit-tested.
// Re-exported from api.js, which everything else imports it from.

// The three tons of the scrap trade (weights are always stored in POUNDS;
// these convert only at pricing time). 'per_ton' is the legacy value from
// before the distinction and meant the industry-default net ton.
export const LB_PER = {
  per_nt: 2000,          // net / short ton
  per_gt: 2240,          // gross / long ton
  per_mt: 2204.62262,    // metric tonne
  per_ton: 2000,         // legacy alias
}

// Suggested invoice amount from a unit's SO pricing — a HELPER for Katherine,
// never authoritative (settlement weights/deductions are her Phase 3b domain).
//
// Deduction math (Jason, Aug 2026): weight deductions (lbs, per tire or per
// unit) reduce billable pounds BEFORE pricing; dollar deductions (per tire
// or per unit) subtract AFTER. Per-tire rules need the unit's tire_count —
// if it's missing, per-tire rules are skipped (never guessed).
export function suggestedUnitAmount(u, deductions = []) {
  const price = u.sales_order?.price
  const unit = u.sales_order?.price_unit
  if (price == null) return null
  if (unit === 'flat') return applyDollarDeductions(Number(price), u, deductions)
  let wt = u.confirmed_net ?? u.net_wt
  if (wt == null) return null
  for (const d of deductions) {
    if (d.kind !== 'weight') continue
    const sgn = d.direction === 'add' ? -1 : 1   // an "add" adjustment increases billable weight
    if (d.basis === 'per_unit') wt -= sgn * Number(d.rate)
    else if (u.tire_count != null) wt -= sgn * Number(d.rate) * u.tire_count
  }
  wt = Math.max(0, wt)
  const perLb = LB_PER[unit]
  const gross = perLb ? (Number(price) * wt) / perLb : Number(price) * wt
  return applyDollarDeductions(gross, u, deductions, wt)
}

function applyDollarDeductions(amount, u, deductions, billableLbs = null) {
  for (const d of deductions) {
    if (d.kind !== 'dollars') continue
    const sgn = d.direction === 'add' ? -1 : 1
    if (d.basis === 'per_unit') amount -= sgn * Number(d.rate)
    else if (d.basis === 'per_lb') { if (billableLbs != null) amount -= sgn * Number(d.rate) * billableLbs }
    else if (u.tire_count != null) amount -= sgn * Number(d.rate) * u.tire_count
  }
  return Math.max(0, amount)
}

// The same amount as suggestedUnitAmount, split into what an invoice shows:
// one SALE line at the unit's pre-adjustment weight, then one line per
// adjustment with its dollar effect (negative = comes off, positive = added).
// Kat (Oct 27): adjustments are separate visible lines, never folded into a
// single total. sale + adjustments always equals suggestedUnitAmount.
//
// Returns null when the unit can't be priced (no SO price or no weight).
export function unitInvoiceBreakdown(u, deductions = []) {
  const price = u.sales_order?.price
  const unit = u.sales_order?.price_unit
  if (price == null) return null
  const adjustments = []
  const skipped = []   // per-tire rules that can't apply because the unit has no tire count
  const push = (d, amount, detail) => adjustments.push({
    category: d.category || null, direction: d.direction === 'add' ? 'add' : 'deduct',
    description: d.description || 'Adjustment', detail, amount,
  })
  const sgnOf = (d) => (d.direction === 'add' ? -1 : 1)   // sign of a DEDUCTION's effect on weight/dollars

  let base, billable = null, usd = 0, weightLabel = null
  if (unit === 'flat') {
    base = Number(price)
  } else {
    const wt = u.confirmed_net ?? u.net_wt
    if (wt == null) return null
    const perLb = LB_PER[unit]
    const usdPerLb = perLb ? Number(price) / perLb : Number(price)
    base = usdPerLb * wt
    weightLabel = `${Number(wt).toLocaleString()} lb`
    billable = wt
    for (const d of deductions) {
      if (d.kind !== 'weight') continue
      let lbs
      if (d.basis === 'per_unit') lbs = Number(d.rate)
      else if (u.tire_count != null) lbs = Number(d.rate) * u.tire_count
      else { skipped.push(d.description || 'Adjustment'); continue }   // per-tire with no tire count: skipped, never guessed
      billable -= sgnOf(d) * lbs
      push(d, -sgnOf(d) * lbs * usdPerLb, `${sgnOf(d) > 0 ? '−' : '+'}${lbs.toLocaleString()} lb`)
    }
    if (billable < 0) {                               // can't bill negative pounds
      adjustments.push({ category: null, direction: 'add', description: 'Floor at zero weight', detail: null, amount: -billable * usdPerLb })
      billable = 0
    }
    usd = usdPerLb
  }
  for (const d of deductions) {
    if (d.kind !== 'dollars') continue
    let amt
    if (d.basis === 'per_unit') amt = Number(d.rate)
    else if (d.basis === 'per_lb') { if (billable == null) continue; amt = Number(d.rate) * billable }
    else if (u.tire_count != null) amt = Number(d.rate) * u.tire_count
    else { skipped.push(d.description || 'Adjustment'); continue }
    push(d, -sgnOf(d) * amt, null)
  }
  let total = base + adjustments.reduce((s, a) => s + a.amount, 0)
  if (total < 0) { adjustments.push({ category: null, direction: 'add', description: 'Floor at $0', detail: null, amount: -total }); total = 0 }
  return {
    sale: { description: 'Sale', detail: unit === 'flat' ? 'flat price' : weightLabel, amount: base },
    adjustments, skipped, total, usdPerLb: usd,
  }
}
