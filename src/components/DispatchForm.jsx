import { useMemo, useState } from 'react'
import Modal from './Modal'
import SearchSelect from './SearchSelect'
import Pill from './Pill'
import { shortLocation } from '../lib/location'
import { saveDispatch, dispatchUnits, nextDispatchNumber, unitLocation } from '../lib/api'

const F = (v) => v ?? ''
const uniq = (arr) => [...new Set(arr.filter(Boolean))]

// One form, two entrances. From the Dispatch tab it's a blank hauling ticket
// (Kim adds units later). From Inventory it arrives with `units` already
// chosen — the sold trailers Kim is arranging a haul for — and pre-fills the
// pickup from where they sit and the destination from who bought them, then
// creates the ticket and assigns the units in one action.
export default function DispatchForm({ dispatch, dispatches, parties, units = [], close, onSaved }) {
  const editing = !!dispatch
  const fromUnits = units.length > 0
  // Kim picks haulers by where they are as much as who they are. Each option
  // carries "Name · City, ST" (from the billing address), and a location box
  // narrows the list by city or state before the name search.
  const [haulerLoc, setHaulerLoc] = useState('')
  const haulerPlace = (h) => shortLocation(null, h.billing_address) || h.state || ''
  const haulers = parties
    .filter((p) => ['Freight', 'Rail Freight'].includes(p.group?.name))
    .filter((h) => {
      const needle = haulerLoc.trim().toLowerCase()
      if (!needle) return true
      return `${haulerPlace(h)} ${h.billing_address || ''} ${h.state || ''}`.toLowerCase().includes(needle)
    })
  // Destination candidates: buyers, plus whoever the chosen units are sold
  // to — ROM filed some real buyers under other dealer groups.
  const soldToIds = new Set(units.map((u) => u.sold_to?.id).filter(Boolean))
  const buyers = parties.filter((p) => p.group?.name === 'Trailer Buyer' || soldToIds.has(p.id))

  // What the chosen units tell us. Mixed buyers or mixed locations are
  // flagged, not silently merged.
  const buyerIds = uniq(units.map((u) => u.sold_to?.id))
  const pickups = uniq(units.map((u) => unitLocation(u)))
  const soleBuyer = buyerIds.length === 1 ? buyers.find((b) => b.id === buyerIds[0]) : null
  const solePickup = pickups.length === 1 ? pickups[0] : ''
  // Addresses are multi-line in ROM; the form field is one line.
  const oneLine = (a) => (a || '').split('\n').map((l) => l.trim()).filter(Boolean).join(', ')
  const pickupAddr = uniq(units.map((u) => oneLine(u.purchase_location_address || u.pickup_address)))

  const [f, setF] = useState({
    hauler_party_id: dispatch?.hauler?.id ?? '',
    hauler_contact: F(dispatch?.hauler_contact),
    pickup_location: F(dispatch?.pickup_location) || solePickup,
    pickup_address: F(dispatch?.pickup_address) || (pickupAddr.length === 1 ? pickupAddr[0] : ''),
    destination_party_id: dispatch?.destination?.id ?? soleBuyer?.id ?? '',
    destination_address: F(dispatch?.destination_address) || (soleBuyer ? oneLine(soleBuyer.billing_address) : ''),
    scheduled_pickup: F(dispatch?.scheduled_pickup),
    notes: F(dispatch?.notes),
    cancelled: dispatch?.cancelled ?? false,
    existing_dispatch_id: '',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const destination = buyers.find((b) => String(b.id) === String(f.destination_party_id))
  // Open tickets already headed to the same yard — add to one instead of
  // creating a second truck for the same drop.
  const reusable = useMemo(() => fromUnits && f.destination_party_id
    ? dispatches.filter((d) => !d.cancelled && String(d.destination?.id) === String(f.destination_party_id)).slice(0, 10)
    : [], [dispatches, f.destination_party_id, fromUnits])
  const existing = reusable.find((d) => String(d.id) === String(f.existing_dispatch_id))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const { existing_dispatch_id, ...rest } = f
      const fields = {
        ...rest,
        hauler_party_id: f.hauler_party_id || null,
        destination_party_id: f.destination_party_id || null,
        scheduled_pickup: f.scheduled_pickup || null,
      }
      if (fromUnits) {
        const r = await dispatchUnits({
          dispatchId: existing?.id ?? null,
          dispatch: existing ? null : { ...fields, dispatch_number: nextDispatchNumber(dispatches) },
          unitIds: units.map((u) => u.id),
        })
        onSaved({ dispatchNumber: existing?.dispatch_number ?? r.dispatch_number, count: units.length, haulerName: haulers.find((h) => String(h.id) === String(f.hauler_party_id))?.name })
        return
      }
      if (!editing) fields.dispatch_number = nextDispatchNumber(dispatches)
      await saveDispatch(fields, dispatch?.id)
      onSaved()
    } catch (ex) {
      setErr(ex.message); setBusy(false)
    }
  }

  const n = units.length
  const title = editing ? `Edit ${dispatch.dispatch_number}`
    : fromUnits ? (n === 1 ? `Dispatch ${units[0].unit_number || `W${units[0].legacy_bwt_id ?? units[0].id}`}` : `Dispatch ${n} units`)
    : 'New dispatch'

  return (
    <Modal title={title} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        {fromUnits && (
          <div className="est-list">
            {units.map((u) => (
              <div key={u.id} className="est-row" style={{ flexWrap: 'wrap' }}>
                <span className="ticket">W{u.legacy_bwt_id ?? u.id}</span>
                <b>{u.unit_number || '—'}</b>
                <span className="muted">{[u.model_year, u.make?.name, u.equipment_type?.name].filter(Boolean).join(' ') || '—'}</span>
                <span className="muted">{unitLocation(u) || ''}</span>
                <span className="muted">{u.sold_to?.name || 'no buyer'}</span>
                <span className="amt"><Pill status={u.status?.name} /></span>
                {/* Kim's trailer-info line: VIN, title, MIA, note — what she checks before booking a truck */}
                <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--ink-soft)', paddingLeft: 4 }}>
                  {u.vin && <span className="mono">VIN {u.vin}</span>}
                  <span> · title {u.title_received ? `received${u.title_received_date ? ' ' + u.title_received_date : ''}` : 'NOT received'}{u.title_type?.name ? ` (${u.title_type.name})` : ''}</span>
                  {u.missing && <span className="warnrow"> · MIA</span>}
                  {u.replacement_for && <div style={{ color: 'var(--copper-deep)' }}>Note: {u.replacement_for}</div>}
                </div>
              </div>
            ))}
            {buyerIds.length > 1 && (
              <div className="est-row warnrow" style={{ background: 'var(--error-tint)' }}>These units are sold to {buyerIds.length} different buyers — one truck usually means one yard. Check before dispatching together.</div>
            )}
            {pickups.length > 1 && (
              <div className="est-row" style={{ background: 'var(--panel)' }}><span className="muted">Units sit at {pickups.length} locations: {pickups.join(' · ')}. Pickup left blank — fill in the route.</span></div>
            )}
          </div>
        )}

        {destination && (
          <div className="banner" style={{ marginBottom: 10 }}>
            <b>{destination.name}</b>
            {destination.billing_address && <span className="muted"> · {destination.billing_address.split('\n').pop()}</span>}
            {destination.title_required_with_delivery && <div className="warnrow" style={{ fontSize: 12.5, marginTop: 2 }}>Title must travel with the delivery.</div>}
            {destination.trucking_notes && <div style={{ fontSize: 12.5, marginTop: 2 }}><b>Kim’s notes:</b> {destination.trucking_notes}</div>}
            {!destination.destruction_agreement_signed && <div className="warnrow" style={{ fontSize: 12.5, marginTop: 2 }}>No destruction agreement on file.</div>}
          </div>
        )}

        {reusable.length > 0 && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Add to</label>
            <select value={f.existing_dispatch_id} onChange={set('existing_dispatch_id')}>
              <option value="">New dispatch ({nextDispatchNumber(dispatches)})</option>
              {reusable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.dispatch_number} · {d.hauler?.name || 'no hauler'} · {d.scheduled_pickup || 'unscheduled'} · {d.units?.[0]?.count ?? 0} unit{(d.units?.[0]?.count ?? 0) === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            <div className="fieldnote">{reusable.length} open ticket{reusable.length === 1 ? '' : 's'} already headed to {destination?.name} — put these on the same truck if it fits.</div>
          </div>
        )}

        {existing ? (
          <div className="banner">Adding {n} unit{n === 1 ? '' : 's'} to <b>{existing.dispatch_number}</b>{existing.hauler?.name && <> with <b>{existing.hauler.name}</b></>}{existing.scheduled_pickup && <span className="muted"> · pickup {existing.scheduled_pickup}</span>}.</div>
        ) : (
        <div className="form-grid">
          <div className="field">
            <label>Hauler location</label>
            <input value={haulerLoc} onChange={(e) => setHaulerLoc(e.target.value)}
              placeholder="City or state, e.g. Nashville or TN" autoFocus />
            <div className="fieldnote">{haulerLoc.trim() ? `${haulers.length} hauler${haulers.length === 1 ? '' : 's'} match` : 'Narrows the hauler list below'}</div>
          </div>
          <div className="field">
            <label>Hauler</label>
            <SearchSelect placeholder="Type to find a hauler…" style={{ width: '100%' }}
              options={haulers.map((h) => ({ id: h.id, label: haulerPlace(h) ? `${h.name} · ${haulerPlace(h)}` : h.name }))}
              value={f.hauler_party_id}
              onChange={(v) => setF({ ...f, hauler_party_id: v })} />
          </div>
          <div className="field">
            <label>Hauler contact (driver / dispatcher)</label>
            <input value={f.hauler_contact} onChange={set('hauler_contact')} placeholder="name · phone" />
          </div>
          <div className="field">
            <label>Pickup location</label>
            <input value={f.pickup_location} onChange={set('pickup_location')} placeholder="Belleville, MI (FedEx 493)" />
          </div>
          <div className="field">
            <label>Pickup address</label>
            <input value={f.pickup_address} onChange={set('pickup_address')} placeholder="from the unit’s purchase location" />
            {fromUnits && !f.pickup_address && (
              <div className="fieldnote warnrow">
                {pickups.length > 1 ? 'Units sit at different locations — enter the route.'
                  : 'No street address on the unit’s purchase record — enter it, or add it to the unit.'}
              </div>
            )}
          </div>
          <div className="field">
            <label>Destination (buying yard)</label>
            <SearchSelect placeholder="Type to find the yard…" style={{ width: '100%' }}
              options={buyers.map((b) => ({ id: b.id, label: b.name }))}
              value={f.destination_party_id}
              onChange={(v) => {
                const picked = buyers.find((b) => String(b.id) === String(v))
                setF({ ...f, destination_party_id: v, existing_dispatch_id: '', destination_address: picked ? oneLine(picked.billing_address) : '' })
              }} />
          </div>
          <div className="field">
            <label>Destination address</label>
            <input value={f.destination_address} onChange={set('destination_address')} placeholder="from the yard’s billing address" />
            {destination && !f.destination_address && (
              <div className="fieldnote warnrow">{destination.name} has no address on its account — enter it here, or add it to the account so it fills next time.</div>
            )}
          </div>
          <div className="field">
            <label>Scheduled pickup</label>
            <input type="date" value={f.scheduled_pickup} onChange={set('scheduled_pickup')} />
          </div>
          <div className="field full">
            <label>Notes (Kim’s field)</label>
            <textarea value={f.notes} onChange={set('notes')} />
          </div>
          {editing && (
            <div className="field">
              <label className="checkline"><input type="checkbox" checked={f.cancelled} onChange={set('cancelled')} /> Cancelled</label>
            </div>
          )}
        </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes'
              : fromUnits ? (existing ? `Add ${n} to ${existing.dispatch_number}` : `Dispatch ${n} unit${n === 1 ? '' : 's'}`)
              : 'Create dispatch'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
