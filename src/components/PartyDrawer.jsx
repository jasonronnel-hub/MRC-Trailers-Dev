import { DEDUCTION_LABELS, formatPrice } from '../lib/api'
import { useNotes, PopupBanners, NotesList } from './Notes'

export default function PartyDrawer({ party: p, orders, dispatches = [], role, close, onEdit }) {
  const isBuyer = p.group?.name === 'Trailer Buyer'
  const isHauler = ['Freight', 'Rail Freight'].includes(p.group?.name)
  const partyOrders = orders.filter((o) => o.buyer?.id === p.id)
  // Kim picks haulers on affordability + reliability — surface both:
  // rate history from past dispatches, and her notes right beside it.
  const haulerDispatches = isHauler
    ? dispatches.filter((d) => d.hauler?.id === p.id && !d.cancelled)
    : []
  const rates = haulerDispatches.filter((d) => d.rate != null)
  const avgRate = rates.length
    ? rates.reduce((s, d) => s + Number(d.rate), 0) / rates.length
    : null
  const contacts = (p.contacts || []).filter((c) => c.active !== false)
  const notesState = useNotes('party', p.id)

  return (
    <div className="drawer-wrap" onClick={close}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="dhead">
          <div>
            <h3>{p.name}</h3>
            <div className="kind">{p.group?.name || 'Party'}</div>
          </div>
          {onEdit && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={onEdit}>Edit</button>}
          <button className="x" onClick={close} aria-label="Close" style={onEdit ? { marginLeft: 0 } : undefined}>×</button>
        </div>
        <div className="dbody">
          {/* Pop-up warnings surface first — ROM's PopUpNote equivalent. */}
          {p.purchase_hot_notes && (
            <div className="banner" style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
              <b>⚑ Warning:</b> {p.purchase_hot_notes}
            </div>
          )}
          {isBuyer && !p.destruction_agreement_signed && (
            <div className="banner" style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
              <b>No destruction agreement on file</b> — do not ship FedEx/Walmart units to this yard.
            </div>
          )}
          <PopupBanners popups={notesState.popups} />

          <dl className="kv">
            <dt>Group</dt>
            <dd>
              <span className="tag">{p.group?.name || '—'}</span>
              {p.merged_parent && <span className="tag" style={{ marginLeft: 6 }}>merged parent</span>}
            </dd>
            <dt>Billing</dt><dd>{p.billing_address || '—'}</dd>
            <dt>Terms</dt><dd>{[p.payment_terms, p.payment_method].filter(Boolean).join(' · ') || '—'}</dd>
            {isBuyer && (<>
              <dt>Deductions</dt>
              <dd>
                {DEDUCTION_LABELS[p.deduction_model] || '—'}
                {p.standard_deductions && <span className="muted"> — {p.standard_deductions}</span>}
              </dd>
              <dt>Destruction</dt>
              <dd>
                {p.destruction_agreement_signed
                  ? <span className="mono">signed {p.destruction_agreement_signed}</span>
                  : <span className="warnrow">NONE on file</span>}
              </dd>
              <dt>REMA member</dt><dd>{p.rema_member ? 'Yes' : 'No'}</dd>
            </>)}
          </dl>

          {contacts.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <b>Contacts</b>
              {contacts.map((c) => (
                <div key={c.id} style={{ fontSize: 13, padding: '3px 0' }}>
                  {c.name || '—'}
                  {c.is_default && <span className="tag" style={{ marginLeft: 6 }}>default</span>}
                  {c.email && <span className="mono muted" style={{ marginLeft: 8, fontSize: 12 }}>{c.email}</span>}
                  {c.phone && <span className="muted" style={{ marginLeft: 8 }}>{c.phone}</span>}
                </div>
              ))}
            </div>
          )}

          {p.general_notes && (
            <div className="banner"><b>Notes:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{p.general_notes}</span></div>
          )}
          {p.trucking_notes && (
            <div className="banner"><b>Kim’s trucking notes:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{p.trucking_notes}</span></div>
          )}

          {isHauler && (<>
            <b>Dispatch history ({haulerDispatches.length})</b>
            {avgRate != null && (
              <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 6px' }}>
                Average rate ${avgRate.toLocaleString(undefined, { maximumFractionDigits: 0 })} across {rates.length} priced dispatch{rates.length === 1 ? '' : 'es'}
              </div>
            )}
            {haulerDispatches.length ? haulerDispatches.slice(0, 8).map((d) => (
              <div key={d.id} className="mono muted" style={{ fontSize: 12.5, padding: '3px 0' }}>
                {d.dispatch_number} · {d.scheduled_pickup || 'unscheduled'} · {d.pickup_location || '?'} → {d.destination?.name || '?'}
                {d.rate != null && ` · $${Number(d.rate).toLocaleString()}${d.rate_basis === 'per_unit' ? '/unit' : d.rate_basis === 'per_mile' ? '/mi' : ''}`}
              </div>
            )) : <div className="muted" style={{ fontSize: 13 }}>None yet — rate history builds as dispatches are logged.</div>}
          </>)}

          {isBuyer && (<>
            <b>Sales orders ({partyOrders.length})</b>
            {partyOrders.length ? partyOrders.map((o) => (
              <div key={o.id} className="mono muted" style={{ fontSize: 12.5, padding: '3px 0' }}>
                {o.order_number} · {o.customer_reference || 'no ref'} · {formatPrice(o.price, o.price_unit)}
                {!o.open && <span className="tag" style={{ marginLeft: 6 }}>closed</span>}
              </div>
            )) : <div className="muted" style={{ fontSize: 13 }}>None yet.</div>}
          </>)}

          <NotesList entityType="party" entityId={p.id} notesState={notesState} role={role} />
        </div>
      </div>
    </div>
  )
}
