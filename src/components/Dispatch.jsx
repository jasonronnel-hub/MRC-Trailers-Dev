import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import Pill from './Pill'
import DispatchForm from './DispatchForm'
import PrintDoc from './PrintDoc'
import EmailModal from './EmailModal'
import { can, assignUnitsToDispatch, markUnitsDelivered, fetchDispatchUnits, fetchUnitsPage } from '../lib/api'
import { dispatchOrderEmail, releaseEmail, deliveryNoticeEmail } from '../lib/emailTemplates'

// Phase 3 strawman screen — the whole workflow is a first draft for Kim.
// Unit lists are lazy-loaded per dispatch (scale pattern).
export default function Dispatch({ data, role, refresh }) {
  const { dispatches, parties, statuses } = data
  const [drawerD, setDrawerD] = useState(null)
  const [drawerUnits, setDrawerUnits] = useState(null)
  const [formD, setFormD] = useState(null)       // null | 'new' | dispatch
  const [assignD, setAssignD] = useState(null)
  const [printDoc, setPrintDoc] = useState(null) // { kind, dispatch }
  const [email, setEmail] = useState(null)       // { title, draft }
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!drawerD) { setDrawerUnits(null); return }
    fetchDispatchUnits(drawerD.id).then(setDrawerUnits).catch(() => setDrawerUnits([]))
  }, [drawerD])

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
    const dUnits = drawerUnits || []
    if (kind === 'order') setEmail({ title: `Dispatch order → ${d.hauler?.name || 'hauler'} (unconfirmed draft)`, draft: dispatchOrderEmail(d, dUnits) })
    if (kind === 'release') {
      const source = parties.find((p) => p.id === dUnits[0]?.source?.id)
      setEmail({ title: `Release → ${source?.name || 'source fleet'} (unconfirmed draft)`, draft: releaseEmail(d, dUnits, source) })
    }
    if (kind === 'notice') setEmail({ title: `Delivery notice → ${d.destination?.name || 'buyer'}`, draft: deliveryNoticeEmail(d, dUnits) })
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
                  <td>{d.units?.[0]?.count ?? 0}</td>
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
                <button className="btn ghost sm" disabled={!drawerUnits} onClick={() => setPrintDoc({ kind: 'order', dispatch: drawerD })}>Dispatch order (print)</button>
                <button className="btn ghost sm" disabled={!drawerUnits} onClick={() => setPrintDoc({ kind: 'release', dispatch: drawerD })}>Release (print)</button>
                <button className="btn ghost sm" disabled={!drawerUnits} onClick={() => openEmail('notice', drawerD)}>Email buyer (Kim’s format)</button>
                <button className="btn ghost sm" disabled={!drawerUnits} onClick={() => openEmail('order', drawerD)}>Email hauler (draft — confirm w/ Kim)</button>
                <button className="btn ghost sm" disabled={!drawerUnits} onClick={() => openEmail('release', drawerD)}>Email release (real per Kim — wording TBD)</button>
              </div>

              <b>Units{drawerUnits ? ` (${drawerUnits.length})` : ''}</b>
              {drawerUnits === null ? (
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Loading…</div>
              ) : drawerUnits.length ? (
                <div className="tablewrap" style={{ marginTop: 8 }}>
                  <table>
                    <tbody>
                      {drawerUnits.map((u) => (
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
              {writable && (drawerUnits || []).some((u) => u.status?.name === 'Dispatched — Delivery Required') && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn sm" onClick={() => deliver(drawerUnits.filter((u) => u.status?.name === 'Dispatched — Delivery Required').map((u) => u.id))}>
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
        <AssignUnitsModal dispatch={assignD} statuses={statuses} close={() => setAssignD(null)} onSaved={saved} />
      )}
      {printDoc && (
        <PrintDoc kind={printDoc.kind} dispatch={printDoc.dispatch}
          units={drawerUnits || []} close={() => setPrintDoc(null)} />
      )}
      {email && <EmailModal draft={email.draft} title={email.title} close={() => setEmail(null)} />}
    </div>
  )
}

// Assign Sold — Dispatch Required units. Server-backed candidate search,
// explicit checkboxes only, selection survives searches (Spec §2.6 rule).
function AssignUnitsModal({ dispatch, statuses, close, onSaved }) {
  const [q, setQ] = useState('')
  const [soldOnly, setSoldOnly] = useState(true)
  const [candidates, setCandidates] = useState(null)
  const [selected, setSelected] = useState(new Map())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const soldId = statuses.find((s) => s.name === 'Sold — Dispatch Required')?.id
  const closedId = statuses.find((s) => s.name === 'Invoiced — Closed')?.id

  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const { rows } = await fetchUnitsPage({
          filters: {
            unattachedDispatch: true,
            q,
            ...(soldOnly
              ? { statusIds: soldId ? [soldId] : [] }
              : { notStatusIds: closedId ? [closedId] : [] }),
          },
          pageSize: 200,
        })
        setCandidates(rows)
      } catch (e) { setErr(e.message) }
    }, 250)
    return () => clearTimeout(timer.current)
  }, [q, soldOnly, soldId, closedId])

  const toggle = (u) => {
    const next = new Map(selected)
    next.has(u.id) ? next.delete(u.id) : next.set(u.id, u)
    setSelected(next)
  }

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      await assignUnitsToDispatch(dispatch.id, [...selected.keys()])
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
      <div className="filters" style={{ marginBottom: 10 }}>
        <input className="search" placeholder="Search unit #, VIN, location…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="checkline" style={{ padding: 0 }}>
          <input type="checkbox" checked={soldOnly} onChange={(e) => setSoldOnly(e.target.checked)} />
          Sold — Dispatch Required only
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
              <span className="muted">{u.sold_to?.name}</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>{u.physical_location}</span>
              <Pill status={u.status?.name} />
            </label>
          ))}
          {candidates.length === 200 && (
            <div className="muted" style={{ fontSize: 12, padding: '6px 8px' }}>Showing first 200 — narrow with search.</div>
          )}
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
