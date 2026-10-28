// sale + adjustments must equal suggestedUnitAmount for every shape of unit.
import { suggestedUnitAmount, unitInvoiceBreakdown } from '../src/lib/pricing.js'
let n = 0, bad = 0
const pick = (a) => a[Math.floor(Math.random() * a.length)]
for (let i = 0; i < 20000; i++) {
  const unit = pick(['flat', 'per_nt', 'per_gt', 'per_mt', 'per_lb', 'per_ton'])
  const u = {
    sales_order: { price: pick([0, 55, 120.5, 300, 1012]), price_unit: unit },
    net_wt: pick([null, 9000, 14500, 16200]), confirmed_net: pick([null, null, 15000]),
    tire_count: pick([null, 8, 12, 18]),
  }
  const ds = Array.from({ length: Math.floor(Math.random() * 4) }, () => {
    const kind = pick(['weight', 'dollars'])
    return { kind, basis: pick(kind === 'weight' ? ['per_unit', 'per_tire'] : ['per_unit', 'per_tire', 'per_lb']),
      rate: pick([5, 25, 100, 400, 2000, 40000]), direction: pick(['deduct', 'add']), category: pick(['tires', 'wood', null]), description: 'x' }
  })
  const a = suggestedUnitAmount(u, ds), b = unitInvoiceBreakdown(u, ds)
  n++
  if ((a == null) !== (b == null)) { bad++; if (bad < 4) console.log('null mismatch', JSON.stringify({ u, ds, a, b })); continue }
  if (a == null) continue
  const sum = b.sale.amount + b.adjustments.reduce((s, x) => s + x.amount, 0)
  if (Math.abs(sum - a) > 0.005 || Math.abs(b.total - a) > 0.005) { bad++; if (bad < 4) console.log('amount mismatch', JSON.stringify({ u, ds, a, sum, total: b.total })) }
}
console.log(`${n - bad} passed, ${bad} failed`)
process.exit(bad ? 1 : 0)
