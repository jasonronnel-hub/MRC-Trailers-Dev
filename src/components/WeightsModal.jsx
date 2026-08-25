import { useState } from 'react'
import Modal from './Modal'
import { saveUnit } from '../lib/api'

const F = (v) => (v == null ? '' : String(v))
const num = (v) => (v === '' ? null : Number(v))

// Scale-ticket weight entry (Katherine's workflow). "Confirmed" = the
// scale-verified numbers she invoices against (ROM's ConfirmedGross/Tare/Net
// — the mechanism behind her weight spot-check). The variance line against
// the reference weight is a visual aid only: per Jason, the materiality call
// stays a manual "feel thing", nothing auto-flags.
export default function WeightsModal({ unit, close, onSaved }) {
  const [f, setF] = useState({
    gross_wt: F(unit.gross_wt), tare_wt: F(unit.tare_wt), net_wt: F(unit.net_wt),
    confirmed_gross: F(unit.confirmed_gross), confirmed_tare: F(unit.confirmed_tare),
    confirmed_net: F(unit.confirmed_net),
    wt_um: unit.wt_um || 'LB',
    tire_count: F(unit.tire_count),
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Setting gross+tare prefills the corresponding net (still editable —
  // some tickets only state a net).
  const set = (k) => (e) => {
    const next = { ...f, [k]: e.target.value }
    const auto = (g, t, n) => {
      if (next[g] !== '' && next[t] !== '' && (k === g || k === t)) {
        const v = Number(next[g]) - Number(next[t])
        if (Number.isFinite(v)) next[n] = String(v)
      }
    }
    auto('gross_wt', 'tare_wt', 'net_wt')
    auto('confirmed_gross', 'confirmed_tare', 'confirmed_net')
    setF(next)
  }

  const ref = unit.ref_weight_lbs
  const cn = num(f.confirmed_net) ?? num(f.net_wt)
  const delta = ref && cn != null ? ((cn - ref) / ref) * 100 : null

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await saveUnit({
        gross_wt: num(f.gross_wt), tare_wt: num(f.tare_wt), net_wt: num(f.net_wt),
        confirmed_gross: num(f.confirmed_gross), confirmed_tare: num(f.confirmed_tare),
        confirmed_net: num(f.confirmed_net),
        wt_um: f.wt_um || null,
        tire_count: f.tire_count === '' ? null : parseInt(f.tire_count, 10),
      }, unit.id)
      onSaved()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  const row = (label, g, t, n, focus) => (
    <div className="field full">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" step="any" min="0" placeholder="Gross" value={f[g]} onChange={set(g)} autoFocus={focus} />
        <input type="number" step="any" min="0" placeholder="Tare" value={f[t]} onChange={set(t)} />
        <input type="number" step="any" min="0" placeholder="Net" value={f[n]} onChange={set(n)} />
      </div>
    </div>
  )

  return (
    <Modal title={`Weights — ${unit.unit_number || `W${unit.legacy_bwt_id ?? unit.id}`}`} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          {row('Our weights (lb)', 'gross_wt', 'tare_wt', 'net_wt', true)}
          {row('Confirmed — scale-verified, invoiced against (lb)', 'confirmed_gross', 'confirmed_tare', 'confirmed_net')}
          <div className="field">
            <label>Unit of measure</label>
            <input value={f.wt_um} onChange={(e) => setF({ ...f, wt_um: e.target.value })} placeholder="LB / EA" />
          </div>
          <div className="field">
            <label>Tire count</label>
            <input type="number" min="0" value={f.tire_count}
              onChange={(e) => setF({ ...f, tire_count: e.target.value })} />
            <div className="fieldnote">Feeds per-tire deductions; leave blank if not counted.</div>
          </div>
        </div>

        {ref ? (
          <div className="banner" style={delta != null && Math.abs(delta) >= 10
            ? { background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }
            : undefined}>
            <b>Spot-check:</b> reference weight {Number(ref).toLocaleString()} lb
            {cn != null && (
              <> · entered net {cn.toLocaleString()} lb · Δ {delta > 0 ? '+' : ''}{delta.toFixed(1)}%</>
            )}
            <div style={{ fontSize: 12, marginTop: 2 }}>Materiality is your call — nothing is flagged automatically.</div>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12.5 }}>No reference weight on this unit — no spot-check comparison available.</p>
        )}

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save weights'}</button>
        </div>
      </form>
    </Modal>
  )
}
