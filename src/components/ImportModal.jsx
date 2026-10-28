import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import SearchSelect from './SearchSelect'
import { CommoditySelect } from './SellModal'
import { FIELDS, parseText, parseFile, findHeaderRow, autoMap, applyMapping, newBatchId, headerSignature } from '../lib/importSheet'
import { supabase } from '../lib/supabase'
import { fetchImportProfiles, saveImportProfile } from '../lib/api'
import { shortLocation } from '../lib/location'
import { decodeVin, COMMODITY_BY_LENGTH } from '../lib/vin'
import { sheetDate } from '../lib/importSheet'

// Bulk purchase intake (Jason's list, Sept 2026). Three steps:
//   1. load — paste from Excel, or pick a .csv/.xlsx file
//   2. map  — every column is matched to a unit field by name; fix any
//   3. review — duplicates against the DATABASE are unchecked, each row
//      shows what it is missing, then import lands the checked rows as
//      Purchased Not Ready tagged with one batch id. Rows still missing
//      data show up in Needs attention as "needs backfill".
// Review the real supplier files with Catherine before cutover.
export default function ImportModal({ parties, equipTypes, commodityCodes = [], makes = [], close, onSaved }) {
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
  // Saved mappings: match this sheet's headers against what's been mapped
  // before (Kat: every supplier's spreadsheet is different; map once).
  const [profiles, setProfiles] = useState([])
  const [matched, setMatched] = useState(null)
  const [remember, setRemember] = useState(true)
  const [profileName, setProfileName] = useState('')
  useEffect(() => { fetchImportProfiles().then(setProfiles).catch(() => setProfiles([])) }, [])

  const headers = grid ? grid[headerIdx] || [] : []
  // Sites (stations / DCs) under the chosen fleet. A sheet's "Pickup Location"
  // is usually the site NUMBER (Walmart DC 6009 = "Walmart - Mt Pleasant IA -
  // 6009"); sometimes a name. Resolve to the site record so the unit links
  // to it and the pickup address comes from there.
  const sourceSites = (parties.find((p) => String(p.id) === String(sourceId))?.contacts || []).filter((c) => c.active !== false)
  const siteCode = (name) => (name.match(/-\s*(\d{3,5})\s*$/) || [])[1]
  const resolveSite = (loc, addr) => {
    const l = String(loc || '').trim(); if (!l) return null
    let hits = /^\d{3,5}$/.test(l) ? sourceSites.filter((c) => siteCode(c.name) === l) : sourceSites.filter((c) => c.name.toLowerCase().includes(l.toLowerCase()))
    // Two sites can share a code (Walmart 7048 = McCarran NV and Sparks NV).
    // Prefer the one whose NAME carries the sheet's city, then its address.
    if (hits.length > 1 && addr) {
      const city = (shortLocation(null, addr) || '').split(',')[0].toLowerCase()
      const byName = hits.filter((c) => c.name.toLowerCase().includes(city))
      const byAddr = hits.filter((c) => (shortLocation(null, c.address) || '').toLowerCase().includes(city))
      hits = byName.length ? byName : byAddr.length ? byAddr : hits
    }
    return hits[0] || null
  }
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
      const site = resolveSite(r.location, r.address)
      const decoded = decodeVin(r.vin)
      const derivedCommodity = !r.commodity_code && decoded.lengthFt ? COMMODITY_BY_LENGTH[decoded.lengthFt] || null : null
      if (!r.unit_number && !r.vin) issues.push('no identifier')
      if (r.vin && !decoded.valid) issues.push('VIN not 17 chars')
      if (r.purchase_price == null) issues.push('no price')
      if (!r.location && !r.address) issues.push('no location')
      else if (r.location && !site && sourceId) issues.push(`no site for "${r.location}" under this fleet`)
      if (r.commodity_code && !codes.has(r.commodity_code)) issues.push(`unknown commodity ${r.commodity_code}`)
      if (r.type && !typeByText(r.type)) issues.push(`unknown type "${r.type}"`)
      return { ...r, issues, site, decoded, derivedCommodity }
    })
  }, [grid, headerIdx, mapping, codes, sourceId])   // eslint-disable-line react-hooks/exhaustive-deps

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
        numList.length ? supabase.from('units').select('unit_number, source_party_id').in('unit_number', numList) : { data: [] },
      ])
      // A VIN is a trailer. A unit number is only a trailer within one fleet
      // (Walmart 55556 and FedEx 55556 are different trailers), so a number
      // match counts only against the same source — or any source when none
      // is chosen yet.
      const ex = {
        vins: new Set((byVin.data || []).map((u) => u.vin?.toLowerCase()).filter(Boolean)),
        nums: new Set((byNum.data || []).filter((u) => !sourceId || String(u.source_party_id) === String(sourceId)).map((u) => u.unit_number?.toLowerCase()).filter(Boolean)),
      }
      if (cancelled) return
      setExisting(ex)
      setSelected(new Set(parsed.map((_, i) => i).filter((i) => !isDupe(parsed[i], ex))))
    }
    run().catch((e) => setErr(e.message))
    return () => { cancelled = true }
  }, [parsed, sourceId])   // eslint-disable-line react-hooks/exhaustive-deps

  const applyProfile = (p) => {
    setMatched(p); setMapping(p.mapping || {}); setRemember(false); setProfileName(p.name)
    if (p.supplier_party_id) setSourceId(p.supplier_party_id)
    if (p.defaults?.equipId) setEquipId(String(p.defaults.equipId))
    if (p.defaults?.commodity) setCommodityDefault(p.defaults.commodity)
    if (p.defaults?.rateUnit) setRateUnit(p.defaults.rateUnit)
  }
  const load = async (rows) => {
    if (!rows?.length) { setErr('Nothing to import.'); return }
    const h = findHeaderRow(rows)
    setGrid(rows); setHeaderIdx(h); setErr('')
    const p = profiles.find((x) => x.header_signature === headerSignature(rows[h] || []))
    if (p) applyProfile(p)
    else { setMatched(null); setMapping(autoMap(rows[h] || [])); setRemember(true); setProfileName('') }
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
    const vanType = equipTypes.find((t) => t.name === 'Long Straight Rail')
    const purchaseDate = sheetDate(grid, headerIdx)
    const makeId = (name) => makes.find((m) => m.name === name)?.id ?? null
    const rows = [...selected].map((i) => {
      const r = parsed[i]
      // A decoded 48'/53' van with no type on the sheet is a straight rail.
      const type = typeByText(r.type) || (!r.type && [48, 53, 45].includes(r.decoded.lengthFt) ? vanType : null) || defaultType || null
      return {
        unit_number: r.unit_number || null,
        vin: r.vin || null,
        purchase_contact_id: r.site?.id ?? null,
        // Same City, ST reduction the migration applies to ROM station names;
        // the site record wins when the sheet only had a code.
        physical_location: (r.site ? shortLocation(r.site.name, r.site.address) : null) || shortLocation(r.location, r.address) || r.location || null,
        pickup_address: r.address || r.site?.address || null,
        make_id: makeId(r.decoded.make),
        purchase_date: purchaseDate || undefined,
        purchase_price: r.purchase_price,
        purchase_rate: r.purchase_rate,
        purchase_rate_unit: r.purchase_rate != null ? rateUnit : null,
        commodity_code: codes.has(r.commodity_code) ? r.commodity_code : (r.derivedCommodity || commodityDefault || null),
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
      if (remember && profileName.trim()) {
        await saveImportProfile({
          name: profileName.trim(), supplier_party_id: sourceId || null,
          header_signature: headerSignature(headers), mapping,
          defaults: { equipId: equipId || null, commodity: commodityDefault || null, rateUnit },
        }).catch(() => {})   // a failed save never blocks the import
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
          {matched ? (
            <div className="banner" style={{ marginBottom: 10 }}><b>Using saved mapping: {matched.name}.</b> Same columns as last time — check the preview and import.</div>
          ) : (
            <div className="banner" style={{ marginBottom: 10 }}>New layout — columns were matched by name. Fix any that are wrong; it’s remembered for next time.</div>
          )}
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <div className="field">
              <label>Header row</label>
              <select value={headerIdx} onChange={(e) => { const h = Number(e.target.value); setHeaderIdx(h); const p = profiles.find((x) => x.header_signature === headerSignature(grid[h] || [])); if (p) applyProfile(p); else { setMatched(null); setMapping(autoMap(grid[h] || [])) } }}>
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
                <span className="muted">{r.site ? r.site.name : (r.location || r.address || '')}</span>
                {(r.decoded.lengthFt || r.decoded.make) && <span className="tag" style={{ fontSize: 11 }}>{[r.decoded.lengthFt && `${r.decoded.lengthFt}'`, r.decoded.make].filter(Boolean).join(' ')}</span>}
                {(r.commodity_code || r.derivedCommodity) && <span className="mono muted" style={{ fontSize: 11.5 }}>{r.commodity_code || r.derivedCommodity}</span>}
                <span style={{ marginLeft: 'auto' }}>{r.purchase_price != null ? `$${r.purchase_price.toLocaleString()}` : '—'}</span>
                {isDupe(r) && <span className="tag" style={{ color: 'var(--error)', borderColor: 'var(--error)' }}>already in system</span>}
                {r.issues.map((x) => <span key={x} className="tag" style={{ color: 'var(--copper-deep)', borderColor: 'var(--copper)' }}>{x}</span>)}
              </label>
            ))}
            {!parsed.length && <div className="muted" style={{ padding: 10, fontSize: 13 }}>No rows with a unit # or VIN — check the header row and the Unit # / VIN mapping.</div>}
          </div>
          <div className="field" style={{ margin: '8px 0' }}>
            <label className="checkline"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember this mapping as</label>
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} disabled={!remember}
              placeholder={suppliers.find((x) => String(x.id) === String(sourceId))?.name ? `${suppliers.find((x) => String(x.id) === String(sourceId)).name} spreadsheet` : 'e.g. Walmart monthly list'} />
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {parsed.filter((r) => r.site).length} of {parsed.length} rows resolved to a site under {suppliers.find((x) => String(x.id) === String(sourceId))?.name || 'the fleet'} · {parsed.filter((r) => r.decoded.lengthFt).length} sized from the VIN{sheetDate(grid, headerIdx) ? ` · purchase date ${sheetDate(grid, headerIdx)} from the sheet` : ''}.
          </p>
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
