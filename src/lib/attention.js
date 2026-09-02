// Needs Attention — a multi-status, date-driven queue (Jason, Sept 2026).
//
// PROVISIONAL THRESHOLDS: agree these with TJ (inventory), Kim (dispatch)
// and accounting (AR) before cutover. Each is one number here; the queue
// itself is assembled in Inventory.jsx from these rules.

export const ATTENTION = {
  notReadyDays: 45,        // Purchased Not Ready older than this, by purchase date
  readyUnsoldDays: 21,     // Ready — Sales Required older than this, by ready date
  dispatchPastEtaDays: 0,  // Dispatched with a delivery ETA this many days in the past
}

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export const cutoffs = () => ({
  notReadyBefore: daysAgo(ATTENTION.notReadyDays),
  readyBefore: daysAgo(ATTENTION.readyUnsoldDays),
  etaBefore: daysAgo(ATTENTION.dispatchPastEtaDays),
})

const ageDays = (iso) => (iso ? Math.floor((Date.now() - new Date(iso + 'T00:00:00')) / 86400000) : null)

// Why a unit is in the queue — shown as a tag on the row. A unit can have
// more than one reason; the first is the headline.
export function attentionReasons(u, c = cutoffs()) {
  const out = []
  const st = u.status?.name
  if (u.missing) out.push('MIA')
  if (st === 'State Unknown') out.push('state unknown')
  if (st === 'Purchased Not Ready' && u.purchase_date && u.purchase_date <= c.notReadyBefore) out.push(`not ready ${ageDays(u.purchase_date)}d`)
  if (st === 'Ready — Sales Required' && u.ready_date && u.ready_date <= c.readyBefore) out.push(`unsold ${ageDays(u.ready_date)}d`)
  if (st === 'Dispatched — Delivery Required' && u.dispatch?.delivery_eta && u.dispatch.delivery_eta <= c.etaBefore) out.push(`past ETA ${ageDays(u.dispatch.delivery_eta)}d`)
  if (u.import_batch && needsBackfill(u).length) out.push('needs backfill')
  return out
}

// Bulk-imported units that still lack what the pipeline needs downstream.
export function needsBackfill(u) {
  const missing = []
  if (!u.equipment_type?.name && !u.commodity_code) missing.push('type')
  if (!u.physical_location && !u.purchase_location) missing.push('location')
  if (u.purchase_price == null) missing.push('price')
  if (!u.source?.name) missing.push('source')
  if (!u.vin && !u.unit_number) missing.push('identifier')
  return missing
}
