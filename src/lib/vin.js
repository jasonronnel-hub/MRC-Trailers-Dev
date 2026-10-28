// What a trailer VIN tells us without asking anyone. Used by the importer so
// Walmart's sheet (no size, no type, no make) still lands typed.
//
// Validated against Kat's 9/25/26 Walmart upload: 136/136 sizes match her
// hand-entered column. Unknown patterns return null — never a guess.

// World Manufacturer Identifier (first three characters) → make name as it
// appears in trailer_makes.
export const WMI = {
  '1GR': 'Great Dane', '1PN': 'Pines', '3H3': 'Hyundai', '1JJ': 'Wabash',
  '1UY': 'Utility', '1PT': 'Trailmobile', '1DW': 'Stoughton', '1S1': 'Strick',
  '5V8': 'Vanguard', '1NN': 'Vanguard', '1L0': 'Lufkin', '1V9': 'Vanguard',
  '1ZX': 'Fruehauf', '1H5': 'Hyundai', '3H3V': 'Hyundai', '1M9': 'Monon',
  '1F9': 'Fontaine', '1E1': 'Dorsey', '1K9': 'Kentucky',
}

// Length in feet from the descriptor section (characters 4–8). Builders
// encode it differently; these are the patterns in MRC's fleet data.
const LENGTH_RULES = [
  [/^1GRAA96/, 48], [/^1GRAA06/, 53], [/^1GRAA/, 53],          // Great Dane: AA96 = 48', AA06 = 53'
  [/^.{3}V0?482/, 48], [/^.{3}V0?532/, 53],                    // Pines / Hyundai / Wabash: V482 / V532 (some builders pad: V0482)
  [/^.{3}VS2(48|53)/, (m) => Number(m[1])],                    // Utility: VS253
  [/^.{3}V(48|53)/, (m) => Number(m[1])],
  [/^1PT(01J|M1A)/, 53],                                       // Trailmobile 53' vans
  [/^.{3}.?(48|53|45|28|40|20)(?=[A-Z0-9])/, (m) => Number(m[1])],   // last resort: a bare length in the VDS
]

export function decodeVin(vin) {
  const v = String(vin || '').trim().toUpperCase()
  if (v.length !== 17) return { make: null, lengthFt: null, valid: false }
  const make = WMI[v.slice(0, 3)] ?? null
  let lengthFt = null
  for (const [re, val] of LENGTH_RULES) {
    const m = v.match(re)
    if (m) { lengthFt = typeof val === 'function' ? val(m) : val; break }
  }
  return { make, lengthFt, valid: true }
}

// Length → the ROM commodity code MRC uses for a dry-van trailer of that size.
export const COMMODITY_BY_LENGTH = { 53: '7054-53SR', 48: '7048-48TRAIL', 45: '7045-45TRAIL', 28: '7029-28SR' }
