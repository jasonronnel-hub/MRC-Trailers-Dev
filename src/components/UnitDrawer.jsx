import Pill from './Pill'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString())

export default function UnitDrawer({ unit, close, onEdit }) {
  if (!unit) return null
  return (
    <div className="drawer-wrap" onClick={close}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="dhead">
          <div>
            <h3>{unit.unit_number || `W${unit.legacy_bwt_id ?? unit.id}`}</h3>
            <div className="kind">Unit · broker weight ticket</div>
          </div>
          {onEdit && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={onEdit}>Edit</button>}
          <button className="x" onClick={close} aria-label="Close" style={onEdit ? { marginLeft: 0 } : undefined}>×</button>
        </div>
        <div className="dbody">
          <div style={{ marginBottom: 14 }}><Pill status={unit.status?.name} /></div>
          <dl className="kv">
            <dt>BWT #</dt><dd><span className="ticket">W{unit.legacy_bwt_id ?? unit.id}</span></dd>
            <dt>VIN</dt><dd className="mono">{unit.vin || '—'}</dd>
            <dt>Type</dt>
            <dd>
              {unit.equipment_type?.name || '—'}
              {unit.equipment_type?.item_code && <span className="muted"> (item {unit.equipment_type.item_code})</span>}
            </dd>
            <dt>Source</dt><dd>{unit.source?.name || '—'}</dd>
            <dt>Ref weight</dt><dd>{unit.ref_weight_lbs ? `${fmt(unit.ref_weight_lbs)} lb` : '—'}</dd>
            <dt>Purchase price</dt><dd>{unit.purchase_price != null ? `$${fmt(unit.purchase_price)}` : '—'}</dd>
            <dt>Title</dt>
            <dd>
              {unit.title_type?.name || '—'}
              {unit.title_received && <span className="tag" style={{ marginLeft: 6 }}>received</span>}
            </dd>
            <dt>Location</dt><dd>{unit.physical_location || '—'}</dd>
            <dt>Pickup code</dt><dd className="mono">{unit.pickup_location_code || '—'}</dd>
            <dt>Pickup address</dt><dd>{unit.pickup_address || '—'}</dd>
            <dt>Sold to</dt><dd>{unit.sold_to?.name || '—'}</dd>
            <dt>Sales order</dt>
            <dd className="mono">
              {unit.sales_order?.order_number || '—'}
              {unit.sales_order?.customer_reference && <span className="muted"> · {unit.sales_order.customer_reference}</span>}
            </dd>
          </dl>
          {unit.condition_comments && (
            <div className="banner"><b>Condition:</b> {unit.condition_comments}</div>
          )}
        </div>
      </div>
    </div>
  )
}
