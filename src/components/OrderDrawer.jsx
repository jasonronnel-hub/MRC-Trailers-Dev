import { useEffect, useState } from 'react'
import Pill from './Pill'
import { formatPrice, fetchOrderUnits } from '../lib/api'
import { useNotes, PopupBanners, NotesList } from './Notes'
import { deductionLabel } from './DeductionsEditor'
import { buyerOverdue, money } from '../lib/ar'

export default function OrderDrawer({ order: o, role, invoices = [], close, onEdit, onAttach }) {
  const [units, setUnits] = useState(null)   // lazy-loaded, null = loading
  const overdue = o.buyer ? buyerOverdue(invoices, o.buyer.id, o.payment_terms?.name) : null
  const notesState = useNotes('sales_order', o.id)
  useEffect(() => {
    fetchOrderUnits(o.id).then(setUnits).catch(() => setUnits([]))
  }, [o.id])

  return (
    <div className="drawer-wrap" onClick={close}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="dhead">
          <div>
            <h3 className="mono">{o.order_number}</h3>
            <div className="kind">Sales order{o.open ? '' : ' · closed'}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {onAttach && <button className="btn sm" onClick={onAttach}>Attach units</button>}
            {onEdit && <button className="btn ghost sm" onClick={onEdit}>Edit</button>}
            <button className="x" onClick={close} aria-label="Close" style={{ marginLeft: 0 }}>×</button>
          </div>
        </div>
        <div className="dbody">
          <PopupBanners popups={notesState.popups} />
          {overdue && (
            <div className="banner" style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
              <b>{o.buyer.name} is overdue:</b> {overdue.count} invoice{overdue.count === 1 ? '' : 's'}, {money(overdue.amount)}, oldest {overdue.oldest} days past due.
            </div>
          )}
          <dl className="kv">
            <dt>Buyer</dt><dd>{o.buyer?.name || '—'}</dd>
            <dt>Customer ref</dt><dd><span className="tag">{o.customer_reference || '—'}</span></dd>
            <dt>Commodity</dt><dd>{o.item_code ? <><span className="mono">{o.item_code}</span>{o.commodity?.name && <span className="muted"> · {o.commodity.name}</span>}</> : '—'}</dd>
            <dt>Price</dt><dd>{formatPrice(o.price, o.price_unit)}</dd>
            <dt>Terms</dt><dd>{o.payment_terms?.name || <span className="muted">not set</span>}</dd>
            <dt>Title</dt>
            <dd>
              {o.title_required_with_delivery ? <span className="warnrow">Required with delivery</span> : 'Not required'}
              {o.title_notes && <div className="muted" style={{ fontSize: 12.5 }}>{o.title_notes}</div>}
            </dd>
            <dt>Deductions</dt>
            <dd>
              {(o.deductions || []).length
                ? o.deductions.map((d) => <div key={d.id}>{deductionLabel(d)}</div>)
                : <span className="muted">none on this order</span>}
            </dd>
            <dt>Ref weight</dt>
            <dd>{o.ref_weight_lbs ? `${o.ref_weight_lbs.toLocaleString()} lb (Katherine’s spot-check flag)` : '—'}</dd>
            <dt>Created</dt><dd className="mono">{(o.created_at || '').slice(0, 10) || '—'}</dd>
          </dl>

          {o.header_notes && <div className="banner"><b>Header note:</b> {o.header_notes}</div>}
          {o.detail_notes && <div className="banner"><b>Detail note:</b> {o.detail_notes}</div>}

          <b>Attached units{units ? ` (${units.length})` : ''}</b>
          {units === null ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Loading…</div>
          ) : units.length ? (
            <div className="tablewrap" style={{ marginTop: 8 }}>
              <table>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.id} style={{ cursor: 'default' }}>
                      <td><span className="ticket">W{u.legacy_bwt_id ?? u.id}</span></td>
                      <td>{u.unit_number || '—'}</td>
                      <td><Pill status={u.status?.name} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>None attached yet.</div>
          )}

          <NotesList entityType="sales_order" entityId={o.id} notesState={notesState} role={role} />
        </div>
      </div>
    </div>
  )
}
