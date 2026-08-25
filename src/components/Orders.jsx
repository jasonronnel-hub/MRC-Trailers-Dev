import { useState } from 'react'
import { formatPrice } from '../lib/api'
import OrderDrawer from './OrderDrawer'

export default function Orders({ orders }) {
  const [drawerOrder, setDrawerOrder] = useState(null)

  return (
    <div>
      <div className="pagehead">
        <h2>Sales Orders</h2>
        <span className="sub">internal only — buyers issue their own PO</span>
      </div>

      {orders.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>SO #</th><th>Buyer</th><th>Ref</th><th>Item</th>
                <th>Price</th><th>Ref wt</th><th>Units</th><th>Header note</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
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
                  <td>{o.units?.length ?? 0}</td>
                  <td className="muted" style={{ fontSize: 12, maxWidth: 240 }}>{o.header_notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">No sales orders yet.</div>
      )}

      {drawerOrder && <OrderDrawer order={drawerOrder} close={() => setDrawerOrder(null)} />}
    </div>
  )
}
