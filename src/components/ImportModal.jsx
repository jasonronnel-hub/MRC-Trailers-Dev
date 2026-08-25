import { useMemo, useState } from 'react'
import Modal from './Modal'
import { parseBidSheet } from '../lib/bidsheet'
import { supabase } from '../lib/supabase'

// Two-step import: paste → parse & preview (with duplicate detection against
// existing inventory) → insert only the checked rows. Imported units land as
// Purchased Not Ready with the chosen source and equipment type.
export default function ImportModal({ parties, equipTypes, units, close, onSaved }) {
  const suppliers = parties.filter((p) => p.group?.name === 'Trailer Supplier')
  const [paste, setPaste] = useState('')
  const [parsed, setParsed] = useState(null)          // null until Parse clicked
  const [selected, setSelected] = useState(new Set())
  const [sourceId, setSourceId] = useState(suppliers.find((s) => s.name === 'Walmart')?.id ?? '')
  const [equipId, setEquipId] = useState(equipTypes.find((t) => t.name === 'Long Straight Rail')?.id ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const existing = useMemo(() => {
    const vins = new Set(), nums = new Set()
    for (const u of units) {
      if (u.vin) vins.add(u.vin.toLowerCase())
      if (u.unit_number) nums.add(u.unit_number.toLowerCase())
    }
    return { vins, nums }
  }, [units])

  const isDupe = (row) =>
    (row.vin && existing.vins.has(row.vin.toLowerCase())) ||
    (row.unit_number && existing.nums.has(row.unit_number.toLowerCase()))

  const runParse = () => {
    setErr('')
    const { units: rows, error } = parseBidSheet(paste)
    if (error) { setErr(error); setParsed(null); return }
    setParsed(rows)
    // Pre-check everything that isn't already in the system.
    setSelected(new Set(rows.map((_, i) => i).filter((i) => !isDupe(rows[i]))))
  }

  const toggle = (i) => {
    const next = new Set(selected)
    next.has(i) ? next.delete(i) : next.add(i)
    setSelected(next)
  }

  const doImport = async () => {
    setBusy(true); setErr('')
    const equip = equipTypes.find((t) => String(t.id) === String(equipId))
    const rows = [...selected].map((i) => {
      const r = parsed[i]
      return {
        unit_number: r.unit_number || null,
        vin: r.vin || null,
        pickup_location_code: r.pickup_location_code || null,
        pickup_address: r.pickup_address || null,
        condition_comments: r.condition_comments || null,
        purchase_price: r.purchase_price,
        source_party_id: sourceId || null,
        equipment_type_id: equipId || null,
        ref_weight_lbs: equip?.default_ref_weight_lbs ?? null,
        // status defaults to Purchased Not Ready in the schema
      }
    })
    try {
      const { error } = await supabase.from('units').insert(rows)
      if (error) throw error
      onSaved(rows.length)
    } catch (ex) {
      setErr(ex.message); setBusy(false)
    }
  }

  return (
    <Modal title="Import Walmart bid sheet" close={close}>
      {!parsed ? (
        <>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Paste rows straight from Excel (tab-separated), headers included. The parser
            looks for a header with <b>Unit</b> and <b>Vin</b>, then maps
            Unit&nbsp;# · VIN · Pickup Location · Pickup Address · Comments · MRC&nbsp;(price).
            <br /><span style={{ fontSize: 12 }}>FedEx weekly-list import is coming once a real sample of Selena’s Friday email is in hand.</span>
          </p>
          {err && <div className="auth-err">{err}</div>}
          <textarea
            value={paste} onChange={(e) => setPaste(e.target.value)}
            style={{ width: '100%', minHeight: 160, border: '1px solid var(--line)', borderRadius: 6, padding: 10, fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}
            placeholder={'Unit #\tVin\tPickup Location\tPickup Address\tComments\tMRC\n61457\t1PNV...\t3530\t850 W Rusk St, Rockwall, TX\tTires worn but ok\t1033'}
          />
          <div className="form-actions">
            <button className="btn ghost" onClick={close}>Cancel</button>
            <button className="btn" disabled={!paste.trim()} onClick={runParse}>Parse &amp; preview</button>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <div className="field">
              <label>Source (fleet)</label>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Equipment type (applied to all rows)</label>
              <select value={equipId} onChange={(e) => setEquipId(e.target.value)}>
                {equipTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <div className="fieldnote">45-ft all-steel units: fix type/price per unit after import.</div>
            </div>
          </div>
          {err && <div className="auth-err">{err}</div>}
          <div className="attach-list">
            {parsed.map((r, i) => (
              <label key={i} className="attach-row">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                <b>{r.unit_number || '—'}</b>
                <span className="mono muted" style={{ fontSize: 11.5 }}>{r.vin || 'no VIN'}</span>
                <span className="muted">{r.pickup_address || r.pickup_location_code}</span>
                <span style={{ marginLeft: 'auto' }}>{r.purchase_price != null ? `$${r.purchase_price.toLocaleString()}` : '—'}</span>
                {isDupe(r) && <span className="tag" style={{ color: 'var(--error)', borderColor: 'var(--error)' }}>already in system</span>}
              </label>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {selected.size} of {parsed.length} rows selected — imported as
            <b> Purchased Not Ready</b>. Rows already in the system are unchecked by default.
          </p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => { setParsed(null); setErr('') }}>Back</button>
            <button className="btn" disabled={busy || selected.size === 0} onClick={doImport}>
              {busy ? 'Importing…' : `Import ${selected.size} unit${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
