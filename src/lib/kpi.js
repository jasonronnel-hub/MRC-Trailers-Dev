// Dashboard KPI — replaces the old "21,430 Invoiced" tile, which was a count
// of closed units and read like a dollar figure.
//
// PROVISIONAL DEFINITION (Jason, Sept 2026): total invoiced month-to-date,
// by invoice date, excluding voided. Confirm with Steve / accounting; change
// KPI_PERIOD here (and nothing else) if they want a different window.

export const KPI_PERIOD = 'mtd'   // 'mtd' | 'last30' | 'ytd'

const iso = (d) => d.toISOString().slice(0, 10)

export function kpiRange(period = KPI_PERIOD, now = new Date()) {
  const today = iso(now)
  if (period === 'ytd') return { from: `${now.getFullYear()}-01-01`, to: today, label: 'YTD' }
  if (period === 'last30') { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: iso(d), to: today, label: 'last 30 days' } }
  return { from: `${today.slice(0, 7)}-01`, to: today, label: 'month to date' }
}

export const kpiDefinition = (range) =>
  `Sum of invoice amounts dated ${range.from} to ${range.to} (${range.label}), excluding voided invoices. Definition provisional — confirm with Steve/accounting.`
