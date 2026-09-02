import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import SearchSelect from './SearchSelect'
import { CommoditySelect } from './SellModal'
import { FIELDS, parseText, parseFile, findHeaderRow, autoMap, applyMapping, newBatchId } from '../lib/importSheet'
import { supabase } from '../lib/supabase'
import { shortLocation } from '../lib/location'

// Bulk purchase intake (Jason's list, Sept 2026). Three steps:
//   1. load — paste from Excel, or pick a .csv/.xlsx file
//   2. map  — every column is matched to a unit field by name; fix any
//   3. review — duplicates against the DATABASE are unchecked, each row
//      shows what it is missing, then import lands the checked rows as
//      Purchased Not Ready tagged with one batch id. Rows still missing
//      data show up in Needs attention as "needs backfill".
// Review the real supplier files with Catherine before cutover.
export default function ImportModal({ parties, equipTypes, commodityCodes = [], close, onSaved }) {
  const suppliers = parties.filter((p) => p.group?.name === 'Trailer Supplier')
  const [paste, setPaste] = useState('')
  const [fileName, setFileName] = useState('')
  const [grid, setGrid] = useState(null)              // rows of cells, null until loaded
  const [headerIdx, setHeaderIdx] = useState(0)
  const [mapping, setMapping] = useState({})
  const [sourceId, setSourceId] = useState('')
  const [equipId, setEquipId] = useState('')
  const [commodityDefault, setCommodityDefault] = useState('')
  const [rateUnit, setRateUnit] = useState('per_lb')
  const [existing, setExisting] = useState({ vins: new Set(), nums: new Set() })
  const [selected, setSelected] = useState(new Set())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const headers = grid ? grid[headerIdx] || [] : []
  const codes = useMemo(() => new Set(commodityCodes.map((c) => c.code)), [commodityCodes])
  const typeByText = (t) => {
    if (!t) return null
    const n = t.toLowerCase()
    return equipTypes.find((x) => x.name.toLowerCase() === n) || equipTypes.find((x) => n.includes(x.name.toLowerCase())) || null
  }

  const parsed = useMemo(() => {
    if (!grid) return []
    return applyMapping(grid.slice(headerIdx + 1), mapping).map((r) => {
      const issues = []
      if (!r.unit_number && !r.vin) issues.push('no identifier')
      if (r.purchase_price == null) issues.push('no price')
      if (!r.location && !r.address) issues.push('no location')
      if (r.commodity_code && !codes.has(r.commodity_code)) issues.push(`unknown commodity ${r.commodity_code}`)
      if (r.type && !typeByText(r.type)) issues.push(`unknown type "${r.type}"`)
      return { ...r, issues }
    })
  }, [grid, headerIdx, mapping, codes])   // eslint-disable-line react-hooks/exhaustive-deps

  const isDupe = (row, ex = existing) =>
    (row.vin && ex.vins.has(row.vin.toLowerCase())) ||
    (row.unit_number && ex.nums.has(row.unit_number.toLowerCase()))

  // Server-side dupe check whenever the parsed identifiers change.
  useEffect(() => {
    if (!parsed.length) return
    let cancelled = false
    const run = async () => {
      const vinList = parsed.map((r) => r.vin).filter(Boolean)
      const numList = parsed.map((r) => r.unit_number).filter(Boolean)
      const [byVin, byNum] = await Promise.all([
        vinList.length ? supabase.from('units').select('vin').in('vin', vinList) : { data: [] },
        numList.length ? supabase.from('units').select('unit_number').in('unit_number', numList) : { data: [] },
      ])
      const ex = {
        vins: new Set((byVin.data || []).map((u) => u.vin?.toLowerCase()).filter(Boolean)),
        nums: new Set((byNum.data || []).map((u) => u.unit_number?.toLowerCase()).filter(Boolean)),
      }
      if (cancelled) return
      setExisting(ex)
      setSelected(new Set(parsed.map((_, i) => i).filter((i) => !isDupe(parsed[i], ex))))
    }
    run().catch((e) => setErr(e.message))
    return () => { cancelled = true }
  }, [parsed])   // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (rows) => {
    if (!rows?.length) { setErr('Nothing to import.'); return }
    const h = findHeaderRow(rows)
    setGrid(rows); setHeaderIdx(h); setMapping(autoMap(rows[h] || [])); setErr('')
  }
  const loadPaste = () => load(parseText(paste))
  const loadFile = async (file) => {
    if (!file) return
    setFileName(file.name); setBusy(true)
    try { await load(await parseFile(file)) } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const toggle = (i) => { const n = new Set(selected); n.has(i) ? n.delete(i) : n.add(i); setSelected(n) }
  const mapField = (key, idx) => setMapping((m) => { const n = { ...m }; if (idx === '') delete n[key]; else n[key] = Number(idx); return n })

  const doImport = async () => {
    setBusy(true); setErr('')
    const batch = newBatchId()
    const defaultType = equipTypes.find((t) => String(t.id) === String(equipId))
    const rows = [...selected].map((i) => {
      const r = parsed[i]
      const type = typeByText(r.type) || defaultType || null
      return {
        unit_number: r.unit_number || null,
        vin: r.vin || null,
        // Same City, ST reduction the migration applies to ROM station names.
        physical_location: shortLocation(r.location, r.address) || r.location || null,
        pickup_address: r.address || null,
        purchase_price: r.purchase_price,
        purchase_rate: r.purchase_rate,
        purchase_rate_unit: r.purchase_rate != null ? rateUnit : null,
        commodity_code: codes.has(r.commodity_code) ? r.commodity_code : (commodityDefault || null),
        purchase_order_ref: r.purchase_order_ref || null,
        model_year: r.model_year,
        condition_comments: r.condition_comments || null,
        source_party_id: sourceId || null,
        equipment_type_id: type?.id ?? null,
        ref_weight_lbs: type?.default_ref_weight_lbs ?? null,
        import_batch: batch,
        // status defaults to Purchased Not Ready; purchase_date defaults to today
      }
    })
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('units').insert(rows.slice(i, i + 500))
        if (error) throw error
      }
      const backfill = [...selected].filter((i) => parsed[i].issues.length).length
      onSaved({ count: rows.length, batch, backfill })
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  const issueCount = [...selected].filter((i) => parsed[i]?.issues.length).length

  return (
    <Modal title="Import purchase spreadsheet" close={close}>
      {err && <div className="auth-err">{err}</div>}
      {!grid ? (
        <>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Pick the supplier’s file (.xlsx or .csv) or paste rows straight from Excel, headers included.
            Columns are matched to unit fields by name on the next step — you can fix any of them.
          </p>
          <div className="field">
            <label>File</label>
            <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={(e) => loadFile(e.target.files?.[0])} />
            {fileName && <div className="fieldnote">{fileName}</div>}
          </div>
          <div className="field">
            <label>…or paste</label>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)}
              style={{ width: '100%', minHeight: 140, fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}
              placeholder={'Unit #\tVin\tPickup Location\tPickup Address\tComments\tMRC\n61457\t1PNV...\t3530\t850 W Rusk St, Rockwall, TX\tTires worn but ok\t1033'} />
          </div>
          <div className="form-actions">
            <button className="btn ghost" onClick={close}>Cancel</button>
            <button className="btn" disabled={!paste.trim() || busy} onClick={loadPaste}>{busy ? 'Reading…' : 'Read pasted rows'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <div className="field">
              <label>Header row</label>
              <select value={headerIdx} onChange={(e) => { const h = Number(e.target.value); setHeaderIdx(h); setMapping(autoMap(grid[h] || [])) }}>
                {grid.slice(0, 15).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.filter(Boolean).slice(0, 5).join(' · ').slice(0, 60)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Source (fleet) — applied to every row</label>
              <SearchSelect placeholder="Type to find the fleet…" style={{ width: '100%' }}
                options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
                value={sourceId} onChange={setSourceId} />
            </div>
            <div className="field">
              <label>Default type (when the sheet has none)</label>
              <select value={equipId} onChange={(e) => setEquipId(e.target.value)}>
                <option value="">— leave blank —</option>
                {equipTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Default commodity (when the sheet has none)</label>
              <CommoditySelect value={commodityDefault} onChange={setCommodityDefault} commodityCodes={commodityCodes} />
            </div>
            <div className="field">
              <label>Rate unit (if the sheet has a rate column)</label>
              <select value={rateUnit} onChange={(e) => setRateUnit(e.target.value)}>
                <option value="per_lb">per lb</option><option value="per_nt">per net ton</option>
                <option value="per_gt">per gross ton</option><option value="per_mt">per metric tonne</option><option value="flat">flat</option>
              </select>
            </div>
          </div>

          <b style={{ fontSize: 13 }}>Column mapping</b>
          <div className="form-grid" style={{ margin: '6px 0 12px' }}>
            {FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <select value={mapping[f.key] ?? ''} onChange={(e) => mapField(f.key, e.target.value)}>
                  <option value="">— not in this sheet —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `(column ${i + 1})`}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="attach-list">
            {parsed.map((r, i) => (
              <label key={i} className="attach-row">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                <b>{r.unit_number || '—'}</b>
                <span className="mono muted" style={{ fontSize: 11.5 }}>{r.vin || 'no VIN'}</span>
                <span className="muted">{r.location || r.address || ''}</span>
                {r.commodity_code && <span className="mono muted" style={{ fontSize: 11.5 }}>{r.commodity_code}</span>}
                <span style={{ marginLeft: 'auto' }}>{r.purchase_price != null ? `$${r.purchase_price.toLocaleString()}` : '—'}</span>
                {isDupe(r) && <span className="tag" style={{ color: 'var(--error)', borderColor: 'var(--error)' }}>already in system</span>}
                {r.issues.map((x) => <span key={x} className="tag" style={{ color: 'var(--copper-deep)', borderColor: 'var(--copper)' }}>{x}</span>)}
              </label>
            ))}
            {!parsed.length && <div className="muted" style={{ padding: 10, fontSize: 13 }}>No rows with a unit # or VIN — check the header row and the Unit # / VIN mapping.</div>}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {selected.size} of {parsed.length} rows selected — imported as <b>Purchased Not Ready</b> under one batch id.
            {issueCount > 0 && <> <b>{issueCount}</b> still missing data; they import anyway and appear in <b>Needs attention</b> until filled in.</>}
          </p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => { setGrid(null); setErr('') }}>Back</button>
            <button className="btn" disabled={busy || selected.size === 0} onClick={doImport}>
              {busy ? 'Importing…' : `Import ${selected.size} unit${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
