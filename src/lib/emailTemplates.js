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

Kim Neely
Metal Recycling Corp
720-630-9630
www.metalrecyclingcorp.com`,
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

Kim Neely
Metal Recycling Corp
720-630-9630
www.metalrecyclingcorp.com`,
  }
}

// 3 — Delivery notice → the buying yard.
// Structure and wording match Kim's real email (sample from Jason, Aug 2026):
// hauler + delivery day up top, an equipment table (Unit / VIN / Size /
// Material), the notarized bill-of-sale line when BOS units are aboard,
// and her signature block.
const DAY = (iso) => {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'long' })
}

export function deliveryNoticeEmail(d, units) {
  const deliveryDay = DAY(d.delivery_eta) || DAY(d.scheduled_pickup)
  const hasBos = units.some((u) => u.title_type?.name === 'Bill of Sale')
  const rows = units.map((u) => [
    u.unit_number || `W${u.legacy_bwt_id ?? u.id}`,
    u.vin || '—',
    u.equipment_type?.name || '—',
    u.material_type || '',
  ])
  const widths = [4, 3, 4, 8].map((min, i) => Math.max(min, ...rows.map((r) => r[i].length),
    ['Unit', 'VIN', 'Size', 'Material'][i].length))
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()

  return {
    to: '',   // filled from the buyer's default contact in the preview
    subject: `Equipment headed your way — ${units.length} unit${units.length === 1 ? '' : 's'} via ${d.hauler?.name || 'our hauler'}${deliveryDay ? ` on ${deliveryDay}` : ''}`,
    body: `Good afternoon,

${d.hauler?.name || 'Our hauler'} has been dispatched to bring you the below listed equipment${deliveryDay ? ` on ${deliveryDay}` : ''}.${hasBos ? '  Notarized bill of sale will be delivered to your facility ahead of the equipment.' : ''}  Please let me know if you have any questions or run into any issues.  Thank you!

${line(['Unit', 'VIN', 'Size', 'Material'])}
${rows.map(line).join('\n')}

Kim Neely
Metal Recycling Corp
720-630-9630
www.metalrecyclingcorp.com`,
  }
}
