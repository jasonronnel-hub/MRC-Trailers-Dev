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
          {/* Kim's "Trailer Info" tab from ROM, in her order: everything she
              needs at a glance when dispatching. Labels fixed ("Pickup date",
              not "PickupDate Date"). */}
          {unit.replacement_for && (
            <div className="banner" style={{ borderLeftColor: 'var(--copper)' }}>
              <b>Note / replacement for:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{unit.replacement_for}</span>
            </div>
          )}
          <div className="tinfo">
            <dl className="kv">
              <dt>BWT #</dt><dd><span className="ticket">W{unit.legacy_bwt_id ?? unit.id}</span></dd>
              <dt>Unit #</dt><dd>{unit.unit_number || '—'}{unit.alt_unit_number && <span className="muted"> · alt {unit.alt_unit_number}</span>}</dd>
              <dt>VIN</dt><dd className="mono">{unit.vin || '—'}</dd>
              <dt>Type</dt>
              <dd>
                {unit.equipment_type?.name || '—'}
                {unit.commodity_code && <span className="mono muted"> · {unit.commodity_code}</span>}
              </dd>
              <dt>Year / make</dt><dd>{[unit.model_year, unit.make?.name].filter(Boolean).join(' ') || '—'}</dd>
              <dt>Source</dt><dd>{unit.source?.name || '—'}</dd>
              <dt>Location</dt><dd>{unitLocation(unit) || '—'}</dd>
              <dt>Purchase location</dt>
              <dd>
                {unit.purchase_location || unit.pickup_location_code || '—'}
                {(unit.purchase_location_address || unit.pickup_address) && (
                  <><br /><span className="muted">{unit.purchase_location_address || unit.pickup_address}</span></>
                )}
              </dd>
              <dt>Purchase price</dt><dd>{unit.purchase_price != null ? `$${fmt(unit.purchase_price)}` : '—'}{unit.purchase_rate != null && <span className="muted"> · rate {unit.purchase_rate}{unit.purchase_rate_unit ? ` ${unit.purchase_rate_unit.replace('per_', '/')}` : ''}</span>}</dd>
              <dt>Ref weight</dt><dd>{unit.ref_weight_lbs ? `${fmt(unit.ref_weight_lbs)} lb` : '—'}</dd>
              {unit.purchase_order_ref && (<><dt>PO ref</dt><dd className="mono">{unit.purchase_order_ref}</dd></>)}
              {unit.import_batch && (<><dt>Import batch</dt><dd className="mono">{unit.import_batch}</dd></>)}
            </dl>
            <dl className="kv">
              <dt>Created</dt><dd className="mono">{unit.purchase_date || '—'}</dd>
              <dt>Ready</dt><dd>{unit.ready_date ? <>Yes <span className="mono muted">{unit.ready_date}</span></> : (unit.status?.name === 'Purchased Not Ready' ? 'No' : '—')}</dd>
              <dt>MIA</dt><dd>{unit.missing ? <span className="warnrow">Yes</span> : 'No'}</dd>
              <dt>Title received</dt><dd>{unit.title_received ? <>Yes{unit.title_received_date && <span className="mono muted"> {unit.title_received_date}</span>}</> : 'No'}</dd>
              <dt>Title type</dt><dd>{unit.title_type?.name || '—'}</dd>
              <dt>Title sent</dt>
              <dd className="mono">
                {unit.title_sent_date || '—'}
                {unit.title_tracking_num && <><br /><span className="muted">FedEx {unit.title_tracking_num}</span></>}
              </dd>
              <dt>Sold to</dt>
              <dd>
                {unit.sold_to?.name || '—'}
                {unit.sale_location && <span className="muted"> · yard: {unit.sale_location}</span>}
              </dd>
              <dt>Sales order</dt>
              <dd className="mono">
                {unit.sales_order?.order_number || '—'}
                {(unit.sale_cust_ref || unit.sales_order?.customer_reference) && <span className="muted"> · {unit.sale_cust_ref || unit.sales_order.customer_reference}</span>}
              </dd>
              <dt>Sale date</dt><dd className="mono">{unit.sold_date || '—'}</dd>
              <dt>Dispatch</dt><dd className="mono">{unit.dispatch?.dispatch_number || '—'}</dd>
              <dt>Dispatch date</dt><dd className="mono">{unit.dispatch_date || '—'}</dd>
              <dt>Pickup date</dt><dd className="mono">{unit.pickup_date || '—'}</dd>
              <dt>Scheduled</dt><dd className="mono">{unit.scheduled_date || unit.dispatch?.delivery_eta || '—'}</dd>
              <dt>Completed</dt><dd className="mono">{unit.completion_date || '—'}</dd>
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
          </div>
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
