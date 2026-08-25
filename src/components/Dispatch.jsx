import { useMemo, useState } from 'react'
import Modal from './Modal'
import Pill from './Pill'
import DispatchForm from './DispatchForm'
import PrintDoc from './PrintDoc'
import EmailModal from './EmailModal'
import { can, assignUnitsToDispatch, markUnitsDelivered } from '../lib/api'
import { dispatchOrderEmail, releaseEmail, deliveryNoticeEmail } from '../lib/emailTemplates'

// Phase 3 strawman screen — the whole workflow is a first draft for Kim.
export default function Dispatch({ data, role, refresh }) {
  const { dispatches, units, parties, statuses } = data
  const [drawerD, setDrawerD] = useState(null)
  const [formD, setFormD] = useState(null)       // null | 'new' | dispatch
  const [assignD, setAssignD] = useState(null)
  const [printDoc, setPrintDoc] = useState(null) // { kind, dispatch }
  const [email, setEmail] = useState(null)       // { title, draft }
  const [err, setErr] = useState('')

  const writable = can(role, 'editDispatch')
  const saved = () => { setFormD(null); setAssignD(null); setDrawerD(null); refresh() }

  const deliver = async (unitIds) => {
    setErr('')
    try {
      const deliveredId = statuses.find((s) => s.name === 'Delivered — Invoice Required')?.id
      await markUnitsDelivered(unitIds, deliveredId)
      saved()
    } catch (e) { setErr(e.message) }
  }

  const openEmail = (kind, d) => {
    const dUnits = d.units || []
    if (kind === 'order') setEmail({ title: `Email 1 · Dispatch order → ${d.hauler?.name || 'hauler'}`, draft: dispatchOrderEmail(d, dUnits) })
    if (kind === 'release') {
      // source fleet best-effort: the source party of the first unit
      const first = units.find((u) => u.dispatch?.id === d.id)
      const source = parties.find((p) => p.id === first?.source?.id)
      setEmail({ title: `Email 2 · Release → ${source?.name || 'source fleet'}`, draft: releaseEmail(d, dUnits, source) })
    }
    if (kind === 'notice') setEmail({ title: `Email 3 · Delivery notice → ${d.destination?.name || 'buyer'}`, draft: deliveryNoticeEmail(d, dUnits) })
  }

  return (
    <div>
      <div className="pagehead">
        <h2>Dispatch</h2>
        <span className="sub">strawman workflow — Kim edits from here</span>
        {writable && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setFormD('new')}>+ New dispatch</button>
        )}
      </div>

      {err && <div className="auth-err">{err}</div>}

      {dispatches.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Dispatch</th><th>Hauler</th><th>Pickup</th><th>Destination</th>
                <th>Scheduled</th><th>Units</th><th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.map((d) => (
                <tr key={d.id} onClick={() => setDrawerD(d)}>
                  <td className="mono">
                    <b>{d.dispatch_number}</b>
                    {d.cancelled && <span className="tag" style={{ marginLeft: 6, color: 'var(--error)', borderColor: 'var(--error)' }}>cancelled</span>}
                  </td>
                  <td>{d.hauler?.name || '—'}</td>
                  <td className="muted">{d.pickup_location || '—'}</td>
                  <td>{d.destination?.name || '—'}</td>
                  <td className="mono muted">{d.scheduled_pickup || '—'}</td>
                  <td>{d.units?.length ?? 0}</td>
                  <td className="muted">{d.rate != null ? `$${Number(d.rate).toLocaleString()}${d.rate_basis === 'per_unit' ? '/unit' : d.rate_basis === 'per_mile' ? '/mi' : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          No dispatches yet. {writable ? <>Create one, then assign the units that are <b>Sold — Dispatch Required</b>.</> : 'Logistics creates these.'}
        </div>
      )}

      {drawerD && (
        <div className="drawer-wrap" onClick={() => setDrawerD(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="dhead">
              <div>
                <h3 className="mono">{drawerD.dispatch_number}</h3>
                <div className="kind">Dispatch{drawerD.cancelled ? ' · cancelled' : ''}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {writable && !drawerD.cancelled && <button className="btn sm" onClick={() => setAssignD(drawerD)}>Assign units</button>}
                {writable && <button className="btn ghost sm" onClick={() => setFormD(drawerD)}>Edit</button>}
                <button className="x" onClick={() => setDrawerD(null)} aria-label="Close" style={{ marginLeft: 0 }}>×</button>
              </div>
            </div>
            <div className="dbody">
              <dl className="kv">
                <dt>Hauler</dt><dd>{drawerD.hauler?.name || '—'}{drawerD.hauler_contact && <span className="muted"> — {drawerD.hauler_contact}</span>}</dd>
                <dt>Pickup</dt><dd>{drawerD.pickup_location || '—'}{drawerD.pickup_address && <><br /><span className="muted">{drawerD.pickup_address}</span></>}</dd>
                <dt>Destination</dt><dd>{drawerD.destination?.name || '—'}{(drawerD.destination_address || drawerD.destination?.billing_address) && <><br /><span className="muted">{drawerD.destination_address || drawerD.destination.billing_address}</span></>}</dd>
                <dt>Scheduled pickup</dt><dd className="mono">{drawerD.scheduled_pickup || '—'}</dd>
                <dt>Delivery ETA</dt><dd className="mono">{drawerD.delivery_eta || '—'}</dd>
                <dt>Rate</dt><dd>{drawerD.rate != null ? `$${Number(drawerD.rate).toLocaleString()} ${drawerD.rate_basis === 'per_unit' ? 'per unit' : drawerD.rate_basis === 'per_mile' ? 'per mile' : 'flat'}` : '—'}</dd>
              </dl>
              {drawerD.notes && <div className="banner"><b>Notes:</b> {drawerD.notes}</div>}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                <button className="btn ghost sm" onClick={() => setPrintDoc({ kind: 'order', dispatch: drawerD })}>Dispatch order (print)</button>
                <button className="btn ghost sm" onClick={() => setPrintDoc({ kind: 'release', dispatch: drawerD })}>Release (print)</button>
                <button className="btn ghost sm" onClick={() => openEmail('order', drawerD)}>Email 1 · hauler</button>
                <button className="btn ghost sm" onClick={() => openEmail('release', drawerD)}>Email 2 · release</button>
                <button className="btn ghost sm" onClick={() => openEmail('notice', drawerD)}>Email 3 · buyer</button>
              </div>

              <b>Units ({drawerD.units?.length ?? 0})</b>
              {drawerD.units?.length ? (
                <div className="tablewrap" style={{ marginTop: 8 }}>
                  <table>
                    <tbody>
                      {drawerD.units.map((u) => (
                        <tr key={u.id} style={{ cursor: 'default' }}>
                          <td><span className="ticket">W{u.legacy_bwt_id ?? u.id}</span></td>
                          <td>{u.unit_number || '—'}</td>
                          <td><Pill status={u.status?.name} /></td>
                          <td>
                            {writable && u.status?.name === 'Dispatched — Delivery Required' && (
                              <button className="btn ghost sm" onClick={() => deliver([u.id])}>Mark delivered</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>None assigned yet.</div>
              )}
              {writable && (drawerD.units || []).some((u) => u.status?.name === 'Dispatched — Delivery Required') && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn sm" onClick={() => deliver(drawerD.units.filter((u) => u.status?.name === 'Dispatched — Delivery Required').map((u) => u.id))}>
                    Mark ALL delivered
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {formD && (
        <DispatchForm dispatch={formD === 'new' ? null : formD} dispatches={dispatches}
          parties={parties} close={() => setFormD(null)} onSaved={saved} />
      )}
      {assignD && (
        <AssignUnitsModal dispatch={assignD} units={units} close={() => setAssignD(null)} onSaved={saved} />
      )}
      {printDoc && (
        <PrintDoc kind={printDoc.kind} dispatch={printDoc.dispatch}
          units={printDoc.dispatch.units || []} close={() => setPrintDoc(null)} />
      )}
      {email && <EmailModal draft={email.draft} title={email.title} close={() => setEmail(null)} />}
    </div>
  )
}

// Assign Sold — Dispatch Required units to this dispatch. Explicit checkbox
// list only (same rule as attach-to-SO — never "the current view").
function AssignUnitsModal({ dispatch, units, close, onSaved }) {
  const [selected, setSelected] = useState(new Set())
  const [soldOnly, setSoldOnly] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const eligible = useMemo(() => {
    let list = units.filter((u) => !u.dispatch?.id)
    if (soldOnly) list = list.filter((u) => u.status?.name === 'Sold — Dispatch Required')
    return list
  }, [units, soldOnly])

  const toggle = (id) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      await assignUnitsToDispatch(dispatch.id, [...selected])
      onSaved()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  return (
    <Modal title={`Assign units to ${dispatch.dispatch_number}`} close={close}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Assigned units flip to <b>Dispatched — Delivery Required</b>, pick up the dispatch’s
        hauler, and get today as their dispatch date. All of it is audit-logged.
      </p>
      {err && <div className="auth-err">{err}</div>}
      <label className="checkline" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={soldOnly} onChange={(e) => setSoldOnly(e.target.checked)} />
        Sold — Dispatch Required only
      </label>
      {eligible.length ? (
        <div className="attach-list">
          {eligible.map((u) => (
            <label key={u.id} className="attach-row">
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
              <span className="ticket">W{u.legacy_bwt_id ?? u.id}</span>
              <b>{u.unit_number || '—'}</b>
              <span className="muted">{u.equipment_type?.name}</span>
              <span className="muted">{u.sold_to?.name}</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>{u.physical_location}</span>
              <Pill status={u.status?.name} />
            </label>
          ))}
        </div>
      ) : (
        <div className="empty" style={{ padding: 24 }}>No unassigned units match.</div>
      )}
      <div className="form-actions">
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn" disabled={busy || selected.size === 0} onClick={submit}>
          {busy ? 'Assigning…' : `Assign ${selected.size} unit${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  )
}
