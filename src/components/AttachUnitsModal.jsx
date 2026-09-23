import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import Pill from './Pill'
import { attachUnits, fetchUnitsPage, unitLocation } from '../lib/api'
import { formatPrice } from '../lib/api'
import { deductionLabel } from './DeductionsEditor'
import { buyerOverdue, money } from '../lib/ar'

// Attaching works off an EXPLICITLY checked list of units — never "everything
// in the current view" (Spec §2.6). Candidates are fetched from the server
// (Ready + unattached by default, searchable), so this scales past 23k units.
// Checked units stay checked across searches.
export default function AttachUnitsModal({ order, statuses, invoices = [], close, onSaved }) {
  const overdue = order.buyer ? buyerOverdue(invoices, order.buyer.id, order.payment_terms?.name) : null
  const [q, setQ] = useState('')
  const [readyOnly, setReadyOnly] = useState(true)
  const [candidates, setCandidates] = useState(null)
  const [selected, setSelected] = useState(new Map())   // id -> unit (persists across searches)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const readyId = statuses.find((s) => s.name === 'Ready — Sales Required')?.id
  const closedId = statuses.find((s) => s.name === 'Invoiced — Closed')?.id

  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const { rows } = await fetchUnitsPage({
          filters: {
            unattachedSO: true,
            q,
            ...(readyOnly
              ? { statusIds: readyId ? [readyId] : [] }
              : { notStatusIds: closedId ? [closedId] : [] }),
          },
          pageSize: 200,
        })
        setCandidates(rows)
      } catch (e) { setErr(e.message) }
    }, 250)
    return () => clearTimeout(timer.current)
  }, [q, readyOnly, readyId, closedId])

  const toggle = (u) => {
    const next = new Map(selected)
    next.has(u.id) ? next.delete(u.id) : next.set(u.id, u)
    setSelected(next)
  }

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      await attachUnits(order.id, [...selected.keys()])
      onSaved()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  return (
    <Modal title={`Attach units to ${order.order_number}`} close={close}>
      {/* Review the deal before anything gets attached to it. */}
      <div className="banner" style={{ marginTop: 0 }}>
        <b>{order.buyer?.name}</b> · <b>{formatPrice(order.price, order.price_unit)}</b>
        <span className="muted"> · {order.payment_terms?.name || 'terms not set'}{order.item_code ? ` · ${order.item_code}` : ''}</span>
        <div style={{ fontSize: 12.5, marginTop: 4 }}>
          Deductions: {(order.deductions || []).length ? order.deductions.map(deductionLabel).join('; ') : <span className="muted">none on this order</span>}
        </div>
        {order.title_required_with_delivery && <div className="warnrow" style={{ fontSize: 12.5, marginTop: 2 }}>Title must travel with the delivery.</div>}
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Attached units flip to <b>Sold — Dispatch Required</b> automatically and the change is audit-logged.</div>
      </div>
      {overdue && (
        <div className="banner" style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
          <b>{order.buyer.name} is overdue:</b> {overdue.count} invoice{overdue.count === 1 ? '' : 's'}, {money(overdue.amount)}, oldest {overdue.oldest} days past due.
        </div>
      )}
      {order.buyer && !order.buyer.destruction_agreement_signed && (
        <div className="banner" style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
          <b>⚑ {order.buyer.name} has NO destruction agreement on file.</b> Do not ship
          FedEx/Walmart units until it’s signed.
        </div>
      )}
      {err && <div className="auth-err">{err}</div>}
      <div className="filters" style={{ marginBottom: 10 }}>
        <input className="search" placeholder="Search unit #, VIN, location…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="checkline" style={{ padding: 0 }}>
          <input type="checkbox" checked={readyOnly} onChange={(e) => setReadyOnly(e.target.checked)} />
          Ready — Sales Required only
        </label>
      </div>

      {selected.size > 0 && (
        <div className="banner" style={{ marginBottom: 8 }}>
          <b>{selected.size} selected:</b> {[...selected.values()].map((u) => u.unit_number || `W${u.legacy_bwt_id ?? u.id}`).join(', ')}
        </div>
      )}

      {candidates === null ? (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      ) : candidates.length ? (
        <div className="attach-list">
          {candidates.map((u) => (
            <label key={u.id} className="attach-row">
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u)} />
              <span className="ticket">W{u.legacy_bwt_id ?? u.id}</span>
              <b>{u.unit_number || '—'}</b>
              <span className="muted">{u.equipment_type?.name}</span>
              <span className="muted">{u.source?.name}</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>{unitLocation(u)}</span>
              <Pill status={u.status?.name} />
            </label>
          ))}
          {candidates.length === 200 && (
            <div className="muted" style={{ fontSize: 12, padding: '6px 8px' }}>Showing first 200 — narrow with search.</div>
          )}
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
