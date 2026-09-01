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
const PROVINCE = {
  ontario: 'ON', quebec: 'QC', alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB',
  saskatchewan: 'SK', 'nova scotia': 'NS', 'new brunswick': 'NB',
}
// "MEMPHIS" -> "Memphis"; leaves mixed case ("St. Peters", "LA Basin") alone.
const titleCity = (c) => {
  const s = c.trim().replace(/,$/, '')
  return s === s.toUpperCase() && /[A-Z]{3}/.test(s)
    ? s.toLowerCase().replace(/(^|[\s\-./'])([a-z])/g, (_, p, ch) => p + ch.toUpperCase())
    : s
}

// Stations ROM names by city only. ROM carries no evidence for these (the
// carriers' dealer records are corporate HQs), so the state is deduced from
// geography — every entry here is the only city of that name a Hub Group /
// FedEx Ground yard could be in. Kansas City (MO/KS) is deliberately absent:
// it is ambiguous, so it stays city-only until TJ confirms.
const KNOWN_CITY = {
  'dallas': 'Dallas, TX',
  'la': 'Los Angeles, CA',            // Hub Group LA-TI / LA-SB
  'los angeles': 'Los Angeles, CA',
  'st. louis': 'St. Louis, MO',
  'st louis': 'St. Louis, MO',
  'indianapolis': 'Indianapolis, IN',
  'buffalo': 'Buffalo, NY',
  'sudbury': 'Sudbury, ON',
  'nanaiumo': 'Nanaimo, BC',          // ROM's spelling
  'nanaimo': 'Nanaimo, BC',
  'lethbridge': 'Lethbridge, AB',
  'ottawa': 'Ottawa, ON',
  'north calgary': 'North Calgary, AB',
  'calgary': 'Calgary, AB',
}

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
  // address: the last line that looks like "City, ST 97060" — walking up past
  // a trailing "Canada" line. Tolerates a lowercase state ("Denver, Co"), a
  // missing comma ("Beaumont TX 77726"), and a spelled-out province.
  const lines = (address || '').split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/\b(canada|usa)$/i, '').trim()
    let m = line.match(/^(.+?)[\s,]+([A-Za-z]{2})\.?(?:\s+[A-Za-z0-9][A-Za-z0-9 -]*)?$/)
    if (m && !/\d/.test(m[1]) && !/\b(po box|unit|suite|ste|c\/o)\b/i.test(m[1])) return `${titleCity(m[1])}, ${m[2].toUpperCase()}`
    m = line.match(/^(.+?)[\s,]+(ontario|quebec|qu[ée]bec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick)\b/i)
    if (m) return `${titleCity(m[1])}, ${PROVINCE[m[2].toLowerCase().replace('é', 'e')]}`
  }
  // No state anywhere ("Hub Group Dallas -G", "JB Hunt - Kansas City"):
  // the city alone beats the raw string. Drop the carrier and any "-G"/"-TI"
  // station suffix.
  // Skip pure station codes ("6163") so "FXG - Sudbury CAN - 6163" -> "Sudbury".
  const tail = [...segs].reverse()
    .map((s) => s.replace(CARRIER, '').replace(/\s*-\S*$/, '').trim())
    .find((s) => /[a-z]/i.test(s))
  if (tail && KNOWN_CITY[tail.toLowerCase()]) return KNOWN_CITY[tail.toLowerCase()]
  return tail || raw || null
}

// Where the unit is right now. Units created in-app carry physical_location;
// migrated ROM units get it filled at migration from the purchase contact.
// The purchase_location fallback covers rows loaded before that change.
export const unitLocation = (u) =>
  u.physical_location || shortLocation(u.purchase_location, u.purchase_location_address) || null
