// Generic purchase-sheet reader: paste from Excel, a CSV/TSV file, or an
// .xlsx workbook. Finds the header row, maps columns to unit fields by
// name (synonyms below), and lets the user override any mapping. Every
// supplier's sheet is a little different — the mapping step is the point.
import * as XLSX from 'xlsx'

export const FIELDS = [
  { key: 'unit_number',        label: 'Unit #',       aliases: ['unit #', 'unit number', 'unit', 'trailer #', 'trailer number', 'trailer', 'asset', 'asset #', 'equipment #', 'equipment', 'number'] },
  { key: 'vin',                label: 'VIN',          aliases: ['vin', 'vin #', 'serial', 'serial #'] },
  { key: 'location',           label: 'Location',     aliases: ['pickup location', 'location', 'station', 'terminal', 'city', 'site', 'yard'] },
  { key: 'address',            label: 'Address',      aliases: ['pickup address', 'address', 'street'] },
  { key: 'purchase_price',     label: 'Purchase $',   aliases: ['mrc', 'bid', 'purchase price', 'price', 'amount', 'cost', 'total'] },
  { key: 'purchase_rate',      label: 'Rate',         aliases: ['rate', 'price/lb', '$/lb', 'per lb', '$/nt', '$/gt', 'per ton'] },
  { key: 'commodity_code',     label: 'Commodity',    aliases: ['commodity', 'commodity code', 'item code', 'item', 'code'] },
  { key: 'purchase_order_ref', label: 'PO ref',       aliases: ['po', 'po #', 'po number', 'purchase order', 'reference', 'ref'] },
  { key: 'type',               label: 'Type',         aliases: ['type', 'equipment type', 'trailer type', 'size', 'length'] },
  { key: 'model_year',         label: 'Year',         aliases: ['year', 'model year', 'yr'] },
  { key: 'condition_comments', label: 'Comments',     aliases: ['comments', 'comment', 'notes', 'condition', 'remarks'] },
]

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[_\s]+/g, ' ')

// Text → rows of cells. Tabs win (Excel paste); else comma-separated with quotes.
export function parseText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length)
  const tab = lines.some((l) => l.includes('\t'))
  return lines.map((l) => (tab ? l.split('\t') : splitCsv(l)).map((c) => String(c).trim()))
}
function splitCsv(line) {
  const out = []; let cur = ''; let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

// .xlsx/.xls/.csv file → rows of cells (first sheet).
export async function parseFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) return parseText(await file.text())
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim()))
}

// Header row = the first row where at least two cells match a known alias.
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const hits = rows[i].filter((c) => FIELDS.some((f) => f.aliases.includes(norm(c)))).length
    if (hits >= 2) return i
  }
  return 0
}

// header cells → { fieldKey: columnIndex } by best alias match.
export function autoMap(headers) {
  const map = {}
  const taken = new Set()
  for (const f of FIELDS) {
    // exact alias first, then contains
    let idx = headers.findIndex((h, i) => !taken.has(i) && f.aliases.includes(norm(h)))
    if (idx < 0) idx = headers.findIndex((h, i) => !taken.has(i) && norm(h) && f.aliases.some((a) => norm(h).includes(a)))
    if (idx >= 0) { map[f.key] = idx; taken.add(idx) }
  }
  return map
}

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null }

// rows + mapping → unit-shaped objects (strings; validation happens in the modal).
export function applyMapping(rows, mapping) {
  return rows.map((r) => {
    const get = (k) => (mapping[k] != null ? (r[mapping[k]] ?? '').trim() : '')
    return {
      unit_number: get('unit_number'), vin: get('vin'),
      location: get('location'), address: get('address'),
      purchase_price: num(get('purchase_price')), purchase_rate: num(get('purchase_rate')),
      commodity_code: get('commodity_code').toUpperCase(), purchase_order_ref: get('purchase_order_ref'),
      type: get('type'), model_year: num(get('model_year')),
      condition_comments: get('condition_comments'),
    }
  }).filter((u) => u.unit_number || u.vin)
}

export const newBatchId = () => {
  const d = new Date()
  return `IMP-${d.toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}
