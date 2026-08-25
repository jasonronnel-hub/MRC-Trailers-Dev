// Parser for supplier fleet-summary matrices (Selena's "FXG Asset List"
// format): a paste-from-Excel grid whose header row carries equipment-type
// labels and whose first column carries model years. Deterministic, like the
// bid-sheet parser. TOTAL rows/columns are ignored (we recompute and compare).
export function parseFleetMatrix(text) {
  const rows = text.split(/\r?\n/).map((r) => r.split('\t').map((c) => c.trim()))
  if (!rows.length) return { error: 'Nothing to parse.' }

  const isYear = (v) => /^(19|20)\d{2}$/.test(v)

  // Header row: contains ≥3 non-empty, non-numeric labels and no year in col 0.
  const hi = rows.findIndex((r) =>
    !isYear(r[0] || '') &&
    r.filter((c, idx) => idx > 0 && c && !/^\d+$/.test(c)).length >= 3)
  if (hi < 0) return { error: 'Couldn’t find a header row of equipment-type labels. Paste the whole grid from Excel, headers included.' }

  const header = rows[hi]
  const typeCols = []            // [{ col, label }]
  header.forEach((label, col) => {
    if (col === 0) return
    const clean = label.trim()
    if (clean && !/^total$/i.test(clean)) typeCols.push({ col, label: clean })
  })
  if (!typeCols.length) return { error: 'Header row found, but no equipment-type labels in it.' }

  const cells = []               // [{ equipment_label, model_year, n }]
  let sheetTotal = null
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r]
    const first = (row[0] || '').trim()
    if (/^total$/i.test(first)) {
      const nums = row.slice(1).map((v) => parseInt(String(v).replace(/[^0-9]/g, ''), 10)).filter(Number.isFinite)
      if (nums.length) sheetTotal = Math.max(...nums)   // grand total is the largest number on the TOTAL row
      continue
    }
    if (!isYear(first)) continue
    const year = parseInt(first, 10)
    for (const { col, label } of typeCols) {
      const n = parseInt(String(row[col] ?? '').replace(/[^0-9]/g, ''), 10)
      if (Number.isFinite(n) && n > 0) cells.push({ equipment_label: label, model_year: year, n })
    }
  }
  if (!cells.length) return { error: 'Found the header but no year rows with counts.' }

  const total = cells.reduce((s, c) => s + c.n, 0)
  return {
    cells,
    types: typeCols.map((t) => t.label),
    yearMin: Math.min(...cells.map((c) => c.model_year)),
    yearMax: Math.max(...cells.map((c) => c.model_year)),
    total,
    sheetTotal,                  // null if the paste had no TOTAL row
    totalMismatch: sheetTotal != null && sheetTotal !== total,
  }
}

// Aggregate a snapshot's cells by equipment label, oldest-heavy first.
export function totalsByType(cells) {
  const m = new Map()
  for (const c of cells) m.set(c.equipment_label, (m.get(c.equipment_label) || 0) + c.n)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
