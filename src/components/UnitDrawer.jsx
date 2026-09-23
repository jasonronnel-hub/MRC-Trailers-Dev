import { useEffect, useState } from 'react'
import Pill from './Pill'
import { useNotes, PopupBanners, NotesList } from './Notes'
import { fetchStatusLog, unitLocation } from '../lib/api'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString())

function StatusHistory({ unitId, statuses }) {
  const [log, setLog] = useState(null)
  useEffect(() => { fetchStatusLog(unitId).then(setLog).catch(() => setLog([])) }, [unitId])
  const name = (id) => statuses.find((s) => s.id === id)?.name || `status ${id}`

  if (!log?.length) return null
  return (
    <div style={{ marginTop: 16 }}>
      <b>Status history</b>
      {log.map((l) => (
        <div key={l.id} style={{
          borderTop: '1px solid var(--line)', padding: '6px 0', fontSize: 12.5,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10,
        }}>
          <span>
            {l.from_status ? <>{name(l.from_status)} → </> : ''}<b>{name(l.to_status)}</b>
            {l.context && <span className="muted"> · {l.context}</span>}
          </span>
          <span className="muted" style={{ flex: 'none', whiteSpace: 'nowrap' }}>
            {l.changed_at ? new Date(l.changed_at).toLocaleDateString() : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function UnitDrawer({ unit, statuses, role, close, onEdit, onWeights, onReady, onSell, onDispatch, onDeliver, onInvoice }) {
  const notesState = useNotes('unit', unit?.id)
  if (!unit) return null
  return (
    <div className="drawer-wrap" onClick={close}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="dhead">
          <div>
            <h3>{unit.unit_number || `W${unit.legacy_bwt_id ?? unit.id}`}</h3>
            <div className="kind">Unit · broker weight ticket</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {onReady && <button className="btn sm" onClick={onReady}>Mark ready</button>}
            {onSell && <button className={'btn sm' + (onReady ? ' ghost' : '')} onClick={onSell}>Sell…</button>}
            {onDispatch && <button className="btn sm" onClick={onDispatch}>Dispatch…</button>}
            {onDeliver && <button className="btn sm" onClick={onDeliver}>Mark delivered</button>}
            {onInvoice && <button className="btn sm" onClick={onInvoice}>Invoice…</button>}
            {onWeights && <button className="btn ghost sm" onClick={onWeights}>Weights…</button>}
            {onEdit && <button className="btn ghost sm" onClick={onEdit}>Edit</button>}
            <button className="x" onClick={close} aria-label="Close" style={{ marginLeft: 0 }}>×</button>
          </div>
        </div>
        <div className="dbody">
          <div style={{ marginBottom: 14 }}><Pill status={unit.status?.name} /></div>
          <PopupBanners popups={notesState.popups} />
          <dl className="kv">
            <dt>BWT #</dt><dd><span className="ticket">W{unit.legacy_bwt_id ?? unit.id}</span></dd>
            <dt>VIN</dt><dd className="mono">{unit.vin || '—'}</dd>
            <dt>Type</dt>
            <dd>
              {unit.equipment_type?.name || '—'}
              {unit.equipment_type?.item_code && <span className="muted"> (item {unit.equipment_type.item_code})</span>}
            </dd>
            <dt>Commodity</dt><dd className="mono">{unit.commodity_code || '—'}</dd>
            <dt>Source</dt><dd>{unit.source?.name || '—'}</dd>
            <dt>Ref weight</dt><dd>{unit.ref_weight_lbs ? `${fmt(unit.ref_weight_lbs)} lb` : '—'}</dd>
            <dt>Purchase price</dt><dd>{unit.purchase_price != null ? `$${fmt(unit.purchase_price)}` : '—'}{unit.purchase_rate != null && <span className="muted"> · rate {unit.purchase_rate}{unit.purchase_rate_unit ? ` ${unit.purchase_rate_unit.replace('per_', '/')}` : ''}</span>}</dd>
            <dt>Purchase date</dt><dd className="mono">{unit.purchase_date || '—'}</dd>
            {unit.purchase_order_ref && (<><dt>PO ref</dt><dd className="mono">{unit.purchase_order_ref}</dd></>)}
            {unit.import_batch && (<><dt>Import batch</dt><dd className="mono">{unit.import_batch}</dd></>)}
            <dt>Title</dt>
            <dd>
              {unit.title_type?.name || '—'}
              {unit.title_received && <span className="tag" style={{ marginLeft: 6 }}>received</span>}
              {unit.title_sent_date && (
                <div className="muted" style={{ fontSize: 12 }}>
                  sent {unit.title_sent_date}
                  {unit.title_tracking_num && <> · FedEx <span className="mono">{unit.title_tracking_num}</span></>}
                </div>
              )}
            </dd>
            <dt>Location</dt><dd>{unitLocation(unit) || '—'}</dd>
            <dt>Purchase location</dt>
            <dd>
              {unit.purchase_location || unit.pickup_location_code || '—'}
              {(unit.purchase_location_address || unit.pickup_address) && (
                <><br /><span className="muted">{unit.purchase_location_address || unit.pickup_address}</span></>
              )}
            </dd>
            <dt>Sold to</dt>
            <dd>
              {unit.sold_to?.name || '—'}
              {unit.sale_location && <span className="muted"> · yard: {unit.sale_location}</span>}
            </dd>
            <dt>Sale ref</dt><dd><span className="tag">{unit.sale_cust_ref || unit.sales_order?.customer_reference || '—'}</span></dd>
            <dt>Sales order</dt>
            <dd className="mono">
              {unit.sales_order?.order_number || '—'}
              {unit.sales_order?.customer_reference && <span className="muted"> · {unit.sales_order.customer_reference}</span>}
            </dd>
            <dt>Sale date</dt><dd className="mono">{unit.sold_date || '—'}</dd>
            <dt>Dispatch</dt><dd className="mono">{unit.dispatch?.dispatch_number || '—'}</dd>
            {(unit.net_wt != null || unit.confirmed_net != null) && (<>
              <dt>Weights</dt>
              <dd>
                {unit.net_wt != null && <>net {fmt(unit.net_wt)}{unit.wt_um ? ` ${unit.wt_um}` : ''}</>}
                {unit.confirmed_net != null && <span className="muted"> · confirmed {fmt(unit.confirmed_net)}</span>}
              </dd>
            </>)}
            {(unit.deliver_wt_ref || unit.purch_ticket_ref || unit.sales_ticket_ref) && (<>
              <dt>ROM ticket refs</dt>
              <dd className="mono" style={{ fontSize: 12 }}>
                {[
                  unit.deliver_wt_ref && `deliv ${unit.deliver_wt_ref}`,
                  unit.purch_ticket_ref && `purch ${unit.purch_ticket_ref}`,
                  unit.sales_ticket_ref && `sale ${unit.sales_ticket_ref}`,
                ].filter(Boolean).join(' · ')}
              </dd>
            </>)}
            {unit.material_type && (<><dt>Material</dt><dd>{unit.material_type}</dd></>)}
          </dl>
          {unit.condition_comments && (
            <div className="banner"><b>Condition:</b> {unit.condition_comments}</div>
          )}
          <NotesList entityType="unit" entityId={unit.id} notesState={notesState} role={role} />
          <StatusHistory unitId={unit.id} statuses={statuses} />
        </div>
      </div>
    </div>
  )
}
