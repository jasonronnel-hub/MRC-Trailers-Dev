import { useEffect, useState } from 'react'
import Modal from './Modal'
import { can, fetchSnapshots, fetchSnapshotCells, saveSnapshot } from '../lib/api'
import { parseFleetMatrix, totalsByType } from '../lib/fleetMatrix'

// Supplier fleet snapshots (strawman). Selena's Friday report is the whole
// FedEx fleet as a year × type matrix — the supply-side picture, not a pick
// list. Import each report; once two exist for a supplier, the delta shows
// what's aging out / disappearing. How the team wants to slice this is an
// open question for TJ.
export default function Fleet({ data, role }) {
  const { parties } = data
  const [snapshots, setSnapshots] = useState(null)
  const [selected, setSelected] = useState(null)     // snapshot row
  const [cells, setCells] = useState(null)
  const [prevCells, setPrevCells] = useState(null)   // previous snapshot, same supplier
  const [importing, setImporting] = useState(false)
  const [err, setErr] = useState('')

  const reload = () => fetchSnapshots().then((s) => {
    setSnapshots(s)
    if (s.length && !selected) setSelected(s[0])
  }).catch((e) => setErr(e.message))
  useEffect(() => { reload() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) { setCells(null); return }
    setCells(null); setPrevCells(null)
    fetchSnapshotCells(selected.id).then(setCells).catch((e) => setErr(e.message))
    const prev = (snapshots || []).find((s) =>
      s.supplier?.id === selected.supplier?.id && s.report_date < selected.report_date)
    if (prev) fetchSnapshotCells(prev.id).then(setPrevCells).catch(() => {})
  }, [selected, snapshots])

  const totals = cells ? totalsByType(cells) : []
  const prevTotals = prevCells ? new Map(totalsByType(prevCells)) : null
  const grand = cells ? cells.reduce((s, c) => s + c.n, 0) : 0

  // Aging horizon: FXG extended trailer maintenance life from 15 to 21+
  // years (TJ, Aug 2026), so 21 is the default; selectable for comparison.
  const [life, setLife] = useState(21)
  const cutoffYear = new Date().getFullYear() - life
  const oldCount = cells ? cells.filter((c) => c.model_year && c.model_year <= cutoffYear).reduce((s, c) => s + c.n, 0) : 0

  return (
    <div>
      <div className="pagehead">
        <h2>Fleet Reports</h2>
        <span className="sub">supplier fleet snapshots — the supply side, not inventory</span>
        {can(role, 'importSnapshot') && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setImporting(true)}>Import report</button>
        )}
      </div>

      {err && <div className="auth-err">{err}</div>}

      {snapshots === null ? (
        <div className="empty">Loading…</div>
      ) : snapshots.length === 0 ? (
        <div className="empty">
          No fleet reports yet. <b>Import report</b> and paste Selena’s asset-list grid straight from Excel.
        </div>
      ) : (
        <>
          <div className="filters">
            {snapshots.map((s) => (
              <span key={s.id} className={'chip' + (selected?.id === s.id ? ' on' : '')}
                onClick={() => setSelected(s)}>
                {s.supplier?.name || 'Unknown'} · {s.report_date}
              </span>
            ))}
          </div>

          {selected && (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '6px 0 16px' }}>
                <div><div style={{ fontSize: 24, fontWeight: 700 }}>{grand.toLocaleString()}</div><div className="muted" style={{ fontSize: 11 }}>total assets</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 700 }}>{totals.length}</div><div className="muted" style={{ fontSize: 11 }}>equipment types</div></div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{grand ? Math.round((oldCount / grand) * 100) : 0}%</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    <select value={life} onChange={(e) => setLife(Number(e.target.value))}
                      style={{ border: 'none', background: 'none', color: 'inherit', fontSize: 11, padding: 0 }}>
                      {[15, 18, 21].map((y) => <option key={y} value={y}>{y}+ years old</option>)}
                    </select> ({oldCount.toLocaleString()} assets — FXG life now 21+ yrs per TJ)
                  </div>
                </div>
                {prevTotals && (
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>
                      {(grand - [...prevTotals.values()].reduce((a, b) => a + b, 0)).toLocaleString('en-US', { signDisplay: 'always' })}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>vs previous report</div>
                  </div>
                )}
              </div>

              {cells === null ? (
                <div className="empty">Loading counts…</div>
              ) : (
                <div className="tablewrap" style={{ maxWidth: 720 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Equipment (supplier’s label)</th><th>Assets</th>
                        <th>Oldest</th><th>Newest</th>
                        {prevTotals && <th>Δ vs prev</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {totals.map(([label, n]) => {
                        const years = cells.filter((c) => c.equipment_label === label && c.model_year).map((c) => c.model_year)
                        const delta = prevTotals ? n - (prevTotals.get(label) || 0) : null
                        return (
                          <tr key={label} style={{ cursor: 'default' }}>
                            <td><b>{label}</b></td>
                            <td>{n.toLocaleString()}</td>
                            <td className="mono muted">{years.length ? Math.min(...years) : '—'}</td>
                            <td className="mono muted">{years.length ? Math.max(...years) : '—'}</td>
                            {prevTotals && (
                              <td style={{ color: delta < 0 ? 'var(--error)' : delta > 0 ? 'var(--copper-deep)' : 'var(--ink-soft)' }}>
                                {delta === 0 ? '—' : delta.toLocaleString('en-US', { signDisplay: 'always' })}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted" style={{ fontSize: 12 }}>
                Labels are the supplier’s own — BC = bonded composite, RC = regular composite
                (per TJ). Negative deltas = assets that left the fleet since the prior report —
                the retirement pipeline.
              </p>
            </>
          )}
        </>
      )}

      {importing && (
        <ImportSnapshotModal parties={parties} close={() => setImporting(false)}
          onSaved={() => { setImporting(false); setSelected(null); reload() }} />
      )}
    </div>
  )
}

function ImportSnapshotModal({ parties, close, onSaved }) {
  const suppliers = parties.filter((p) => p.group?.name === 'Trailer Supplier')
  const [supplierId, setSupplierId] = useState(suppliers.find((s) => /fedex/i.test(s.name))?.id ?? '')
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [paste, setPaste] = useState('')
  const [parsed, setParsed] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const runParse = () => {
    setErr('')
    const result = parseFleetMatrix(paste)
    if (result.error) { setErr(result.error); setParsed(null); return }
    setParsed(result)
  }

  const doImport = async () => {
    setBusy(true); setErr('')
    try {
      await saveSnapshot({
        supplier_party_id: supplierId || null,
        report_date: reportDate,
        source_note: note || null,
        total_assets: parsed.total,
      }, parsed.cells)
      onSaved()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  return (
    <Modal title="Import fleet report" close={close}>
      {!parsed ? (
        <>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Open the supplier’s asset list in Excel, select the whole grid (type labels
            across the top, model years down the side), copy, and paste here.
          </p>
          {err && <div className="auth-err">{err}</div>}
          <div className="form-grid" style={{ marginBottom: 8 }}>
            <div className="field">
              <label>Supplier</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Report date</label>
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
            <div className="field full">
              <label>Source note</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="FXG Asset List 6-9-2026.xlsx — Selena’s Friday email" />
            </div>
          </div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)}
            style={{ width: '100%', minHeight: 150, border: '1px solid var(--line)', borderRadius: 6, padding: 10, fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5 }}
            placeholder={'\t28DF\t28SR\t53SR\tDOLLY\n2007\t1160\t1263\t\t41\n2008\t2205\t180\t\t29'} />
          <div className="form-actions">
            <button className="btn ghost" onClick={close}>Cancel</button>
            <button className="btn" disabled={!paste.trim()} onClick={runParse}>Parse &amp; preview</button>
          </div>
        </>
      ) : (
        <>
          {err && <div className="auth-err">{err}</div>}
          <div className="banner">
            <b>{parsed.total.toLocaleString()} assets</b> across {parsed.types.length} equipment
            types, model years {parsed.yearMin}–{parsed.yearMax}.
            {parsed.sheetTotal != null && (parsed.totalMismatch
              ? <span style={{ color: 'var(--error)' }}> ⚠ The sheet’s own TOTAL says {parsed.sheetTotal.toLocaleString()} — check the paste.</span>
              : ' Matches the sheet’s TOTAL row ✓')}
          </div>
          <div className="attach-list">
            {totalsByType(parsed.cells).map(([label, n]) => (
              <div key={label} className="attach-row" style={{ cursor: 'default' }}>
                <b>{label}</b>
                <span style={{ marginLeft: 'auto' }}>{n.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setParsed(null)}>Back</button>
            <button className="btn" disabled={busy} onClick={doImport}>
              {busy ? 'Importing…' : 'Save snapshot'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
