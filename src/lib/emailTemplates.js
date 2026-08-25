// The three standard emails (Spec Phase 3) — STRAWMAN WORDING throughout.
// Kim owns this file: every subject line and body is a first draft for her
// to rewrite. Nothing here sends automatically — the UI only produces a
// reviewed draft (.eml download or mail-app handoff), per Spec §1.
//
// Each template returns { to, subject, body }. `to` is best-effort from the
// party record; Kim can correct it in the preview before opening the draft.

const unitLines = (units) => units.map((u) =>
  `  • ${u.unit_number || `W${u.legacy_bwt_id ?? u.id}`}` +
  `${u.equipment_type?.name ? ` — ${u.equipment_type.name}` : ''}` +
  `${u.vin ? ` — VIN ${u.vin}` : ''}`).join('\n')

const rateLine = (d) => d.rate == null ? '' :
  `Rate: $${Number(d.rate).toLocaleString()}${d.rate_basis === 'per_unit' ? ' per unit' : d.rate_basis === 'per_mile' ? ' per mile' : ' flat'}\n`

// 1 — Dispatch order → the hauler
export function dispatchOrderEmail(d, units) {
  return {
    to: d.hauler?.email || '',
    subject: `MRC Dispatch ${d.dispatch_number} — ${units.length} unit${units.length === 1 ? '' : 's'}, ${d.pickup_location || 'pickup'} → ${d.destination?.name || 'destination'}`,
    body: `${d.hauler?.name || 'Dispatch'},

Please schedule the following move for MRC Trailers & Containers:

Dispatch #: ${d.dispatch_number}
Pickup: ${d.pickup_location || ''}${d.pickup_address ? `\n        ${d.pickup_address}` : ''}
Deliver to: ${d.destination?.name || ''}${d.destination_address ? `\n        ${d.destination_address}` : ''}
Scheduled pickup: ${d.scheduled_pickup || 'TBD'}
${rateLine(d)}
Units (${units.length}):
${unitLines(units)}

${d.notes ? `Notes: ${d.notes}\n\n` : ''}Please reply to confirm the pickup date and driver.

Kim
MRC Trailers & Containers`,
  }
}

// 2 — Release authorization → the source fleet (FedEx, Walmart, …)
export function releaseEmail(d, units, sourceParty) {
  return {
    to: sourceParty?.email || '',
    subject: `MRC release authorization — ${units.length} unit${units.length === 1 ? '' : 's'} at ${d.pickup_location || 'your facility'}`,
    body: `Hello,

MRC has scheduled pickup of the following purchased units. Please release
them to our carrier:

Carrier: ${d.hauler?.name || 'TBD'}${d.hauler_contact ? ` (${d.hauler_contact})` : ''}
Pickup location: ${d.pickup_location || ''}${d.pickup_address ? ` — ${d.pickup_address}` : ''}
Scheduled: ${d.scheduled_pickup || 'TBD'}

Units (${units.length}):
${unitLines(units)}

Reference: MRC dispatch ${d.dispatch_number}. Please contact us with any
questions before release.

Kim
MRC Trailers & Containers`,
  }
}

// 3 — Delivery notice → the buying yard
export function deliveryNoticeEmail(d, units) {
  const so = units.find((u) => u.sales_order?.order_number)?.sales_order
  return {
    to: '',   // filled from the buyer's default contact in the preview
    subject: `MRC delivery — ${units.length} unit${units.length === 1 ? '' : 's'} en route${so ? ` (ref ${so.customer_reference || so.order_number})` : ''}`,
    body: `Hello,

The following units are en route to your yard via ${d.hauler?.name || 'our carrier'}:

${unitLines(units)}

Expected delivery: ${d.delivery_eta || d.scheduled_pickup || 'TBD'}
${so ? `Order reference: ${so.customer_reference || so.order_number}\n` : ''}
Please send scale tickets after processing so we can finalize the invoice.

Kim
MRC Trailers & Containers`,
  }
}
