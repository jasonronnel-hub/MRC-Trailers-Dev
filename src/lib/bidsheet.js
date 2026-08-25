// Walmart bid-sheet parser — deterministic, ported from the prototype where
// it was proven against real paste-from-Excel data (Spec §5.6). Finds a
// header row containing "Unit" and "Vin", then maps columns by name:
// Unit # · VIN · Pickup Location · Pickup Address · Comments · MRC (price).
export function parseBidSheet(text) {
  const rows = text.split(/\r?\n/).filter((r) => r.trim().length)
  if (!rows.length) return { units: [], error: 'Nothing to parse.' }

  const split = (r) => (r.includes('\t') ? r.split('\t') : r.split(/\s{2,}|,(?=\S)/))

  const hi = rows.findIndex((r) => /unit/i.test(r) && /vin/i.test(r))
  if (hi < 0) return { units: [], error: 'Couldn’t find a header row containing “Unit” and “Vin”. Paste straight from Excel, headers included.' }

  const heads = split(rows[hi]).map((h) => h.trim().toLowerCase())
  const idx = (...names) => {
    for (const n of names) {
      const i = heads.findIndex((h) => h.includes(n))
      if (i >= 0) return i
    }
    return -1
  }
  const iUnit = idx('unit')
  const iVin = idx('vin')
  const iLoc = idx('pickup location', 'location')
  const iAddr = idx('address')
  const iCom = idx('comment')
  const iPrice = idx('mrc', 'bid', 'price', 'amount')

  const out = []
  for (let r = hi + 1; r < rows.length; r++) {
    const c = split(rows[r]).map((x) => x.trim())
    if (!c.length || !(c[iUnit] || c[iVin])) continue
    const price = iPrice >= 0 ? parseFloat((c[iPrice] || '').replace(/[^0-9.-]/g, '')) : NaN
    out.push({
      unit_number: (c[iUnit] || '').trim(),
      vin: (c[iVin] || '').trim(),
      pickup_location_code: iLoc >= 0 ? (c[iLoc] || '').trim() : '',
      pickup_address: iAddr >= 0 ? (c[iAddr] || '').trim() : '',
      condition_comments: iCom >= 0 ? (c[iCom] || '').trim() : '',
      purchase_price: Number.isNaN(price) ? null : price,
    })
  }
  return { units: out, error: out.length ? null : 'Found the header but no data rows.' }
}
