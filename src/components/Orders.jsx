import { useState } from 'react'
import { formatPrice, can } from '../lib/api'
import OrderDrawer from './OrderDrawer'
import OrderForm from './OrderForm'
import AttachUnitsModal from './AttachUnitsModal'

export default function Orders({ data, role, refresh }) {
  const { orders, parties, equipTypes } = data
  const [q, setQ] = useState('')
  const [openOnly, setOpenOnly] = useState(true)
  const [drawerOrder, setDrawerOrder] = useState(null)
  const [formOrder, setFormOrder] = useState(null)    // null = closed, 'new' = create, object = edit
  const [attachOrder, setAttachOrder] = useState(null)

  const saved = () => { setFormOrder(null); setAttachOrder(null); setDrawerOrder(null); refresh() }

  let rows = orders
  if (openOnly) rows = rows.filter((o) => o.open)
  if (q.trim()) {
    const needle = q.trim().toLowerCase()
    rows = rows.filter((o) =>
      [o.order_number, o.customer_reference, o.buyer?.name, o.item_code]
        .some((v) => v && v.toLowerCase().includes(needle)))
  }

  return (
    <div>
      <div className="pagehead">
        <h2>Sales Orders</h2>
        <span className="sub">{rows.length} of {orders.length} — internal only, buyers issue their own PO</span>
        {can(role, 'createOrder') && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setFormOrder('new')}>+ New sales order</button>
        )}
      </div>

      <div className="filters">
        <input className="search" placeholder="Search SO #, ref, buyer, item…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <span className={'chip' + (openOnly ? ' on' : '')} onClick={() => setOpenOnly(true)}>Open</span>
        <span className={'chip' + (!openOnly ? ' on' : '')} onClick={() => setOpenOnly(false)}>All</span>
      </div>

      {rows.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>SO #</th><th>Buyer</th><th>Ref</th><th>Item</th>
                <th>Price</th><th>Ref wt</th><th>Units</th><th>Header note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} onClick={() => setDrawerOrder(o)}>
                  <td className="mono">
                    <b>{o.order_number}</b>
                    {!o.open && <span className="tag" style={{ marginLeft: 6 }}>closed</span>}
                  </td>
                  <td>{o.buyer?.name || '—'}</td>
                  <td><span className="tag">{o.customer_reference || '—'}</span></td>
                  <td className="mono">{o.item_code || '—'}</td>
                  <td>{formatPrice(o.price, o.price_unit)}</td>
                  <td className="muted">{o.ref_weight_lbs ? `${o.ref_weight_lbs.toLocaleString()} lb` : '—'}</td>
                  <td>{o.units?.[0]?.count ?? 0}</td>
                  <td className="muted" style={{ fontSize: 12, maxWidth: 240 }}>{o.header_notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">No sales orders yet.</div>
      )}

      {drawerOrder && (
        <OrderDrawer order={drawerOrder} role={role} close={() => setDrawerOrder(null)}
          onEdit={can(role, 'editOrder') ? () => setFormOrder(drawerOrder) : null}
          onAttach={can(role, 'attachUnits') && drawerOrder.open ? () => setAttachOrder(drawerOrder) : null} />
      )}
      {formOrder && (
        <OrderForm order={formOrder === 'new' ? null : formOrder} orders={orders}
          parties={parties} equipTypes={equipTypes}
          close={() => setFormOrder(null)} onSaved={saved} />
      )}
      {attachOrder && (
        <AttachUnitsModal order={attachOrder} statuses={data.statuses}
          close={() => setAttachOrder(null)} onSaved={saved} />
      )}
    </div>
  )
}
