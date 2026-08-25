import { useEffect, useState } from 'react'
import Pill from './Pill'
import { formatPrice, fetchOrderUnits } from '../lib/api'

export default function OrderDrawer({ order: o, close, onEdit, onAttach }) {
  const [units, setUnits] = useState(null)   // lazy-loaded, null = loading
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
          <dl className="kv">
            <dt>Buyer</dt><dd>{o.buyer?.name || '—'}</dd>
            <dt>Customer ref</dt><dd><span className="tag">{o.customer_reference || '—'}</span></dd>
            <dt>Item code</dt><dd className="mono">{o.item_code || '—'}</dd>
            <dt>Price</dt><dd>{formatPrice(o.price, o.price_unit)}</dd>
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
        </div>
      </div>
    </div>
  )
}
