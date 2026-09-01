// Location display: Jason wants "Little Rock, AR", not ROM's station strings.
//
// ROM's purchase contact name looks like "FXG - Portland OR - 972" (carrier
// prefix, city + state, station code) or "Hub Group Dallas -G" (no state).
// The contact address is "street\nCity, ST ZIP". We reduce either to
// "City, ST" and store that in physical_location at migration; units created
// in-app already type it that way. Raw ROM strings stay on purchase_location /
// purchase_location_address for the drawer.

const STATE = '[A-Z]{2}'
// Carrier words that lead a ROM station name without a " - " separator.
const CARRIER = /^(?:hub group|fxg|fedex(?: ground| freight)?|fec|walmart|wal-mart|ups|j\.?b\.? hunt|union pacific|up|milestone|schneider|swift|werner)\b[\s:]*/i

const CITY_ST = new RegExp(`^(.+?)[\\s,]+(${STATE})$`)

export function shortLocation(name, address) {
  const raw = (name || '').trim()
  if (/^to be determined$/i.test(raw)) return null        // ROM placeholder
  // ROM names are " - " separated: "FXG - Portland OR - 972",
  // "UPRR - DIT - Hutchins TX", "UPS - Richmond VA - Premier Lot". The
  // segment that ends in a state is the location; a trailing "CAN" marks a
  // Canadian province ("Delta BC CAN").
  const segs = raw.split(/\s+-\s+/).map((s) => s.replace(/\s+CAN$/i, '').trim()).filter(Boolean)
  for (let i = segs.length - 1; i >= 0; i--) {
    const m = segs[i].replace(CARRIER, '').match(CITY_ST)
    if (m && !/\d/.test(m[1])) return `${m[1].trim()}, ${m[2]}`
  }
  // address: last line "City, ST 97060"
  const last = (address || '').trim().split('\n').map((l) => l.trim()).filter(Boolean).pop() || ''
  const m = last.match(new RegExp(`^(.+?),\\s*(${STATE})\\b`))
  if (m) return `${m[1].trim()}, ${m[2]}`
  // No state anywhere ("Hub Group Dallas -G", "JB Hunt - Kansas City"):
  // the city alone beats the raw string. Drop the carrier and any "-G"/"-TI"
  // station suffix.
  // Skip pure station codes ("6163") so "FXG - Sudbury CAN - 6163" -> "Sudbury".
  const tail = [...segs].reverse()
    .map((s) => s.replace(CARRIER, '').replace(/\s*-\S*$/, '').trim())
    .find((s) => /[a-z]/i.test(s))
  return tail || raw || null
}

// Where the unit is right now. Units created in-app carry physical_location;
// migrated ROM units get it filled at migration from the purchase contact.
// The purchase_location fallback covers rows loaded before that change.
export const unitLocation = (u) =>
  u.physical_location || shortLocation(u.purchase_location, u.purchase_location_address) || null
