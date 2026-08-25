import { useEffect, useState } from 'react'
import Pill from './Pill'
import { useNotes, PopupBanners, NotesList } from './Notes'
import { fetchStatusLog } from '../lib/api'

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
        <div key={l.id} style={{ borderTop: '1px solid var(--line)', padding: '6px 0', fontSize: 12.5 }}>
          {l.from_status ? <>{name(l.from_status)} → </> : ''}<b>{name(l.to_status)}</b>
          {l.context && <span className="muted"> · {l.context}</span>}
          <span className="muted" style={{ float: 'right' }}>
            {l.changed_at ? new Date(l.changed_at).toLocaleDateString() : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function UnitDrawer({ unit, statuses, role, close, onEdit }) {
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
          {onEdit && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={onEdit}>Edit</button>}
          <button className="x" onClick={close} aria-label="Close" style={onEdit ? { marginLeft: 0 } : undefined}>×</button>
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
            <dt>Source</dt><dd>{unit.source?.name || '—'}</dd>
            <dt>Ref weight</dt><dd>{unit.ref_weight_lbs ? `${fmt(unit.ref_weight_lbs)} lb` : '—'}</dd>
            <dt>Purchase price</dt><dd>{unit.purchase_price != null ? `$${fmt(unit.purchase_price)}` : '—'}</dd>
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
            <dt>Location</dt><dd>{unit.physical_location || '—'}</dd>
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
