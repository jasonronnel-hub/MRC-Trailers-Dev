import { useMemo, useState } from 'react'
import Modal from './Modal'
import Pill from './Pill'
import { attachUnits } from '../lib/api'

// Attaching works off an EXPLICITLY checked list of units — never "everything
// in the current view" (the ROM bulk-update footgun, designed out; Spec §2.6).
export default function AttachUnitsModal({ order, units, close, onSaved }) {
  const [selected, setSelected] = useState(new Set())
  const [q, setQ] = useState('')
  const [readyOnly, setReadyOnly] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const eligible = useMemo(() => {
    let list = units.filter((u) => !u.sales_order?.id)
    if (readyOnly) list = list.filter((u) => u.status?.name === 'Ready — Sales Required')
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter((u) =>
        [u.unit_number, u.vin, u.physical_location, u.source?.name]
          .some((v) => v && v.toLowerCase().includes(needle)))
    }
    return list
  }, [units, q, readyOnly])

  const toggle = (id) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      await attachUnits(order.id, [...selected])
      onSaved()
    } catch (ex) {
      setErr(ex.message); setBusy(false)
    }
  }

  return (
    <Modal title={`Attach units to ${order.order_number}`} close={close}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Buyer: <b>{order.buyer?.name}</b>. Attached units flip to
        <b> Sold — Dispatch Required</b> automatically and the change is audit-logged.
      </p>
      {err && <div className="auth-err">{err}</div>}
      <div className="filters" style={{ marginBottom: 10 }}>
        <input className="search" placeholder="Search unit #, VIN, source, location…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="checkline" style={{ padding: 0 }}>
          <input type="checkbox" checked={readyOnly} onChange={(e) => setReadyOnly(e.target.checked)} />
          Ready — Sales Required only
        </label>
      </div>
      {eligible.length ? (
        <div className="attach-list">
          {eligible.map((u) => (
            <label key={u.id} className="attach-row">
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
              <span className="ticket">W{u.legacy_bwt_id ?? u.id}</span>
              <b>{u.unit_number || '—'}</b>
              <span className="muted">{u.equipment_type?.name}</span>
              <span className="muted">{u.source?.name}</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>{u.physical_location}</span>
              <Pill status={u.status?.name} />
            </label>
          ))}
        </div>
      ) : (
        <div className="empty" style={{ padding: 24 }}>No unattached units match.</div>
      )}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn" disabled={busy || selected.size === 0} onClick={submit}>
          {busy ? 'Attaching…' : `Attach ${selected.size} unit${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  )
}
