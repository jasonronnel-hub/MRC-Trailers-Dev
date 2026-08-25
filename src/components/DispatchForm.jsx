import { useState } from 'react'
import Modal from './Modal'
import SearchSelect from './SearchSelect'
import { saveDispatch, nextDispatchNumber } from '../lib/api'

const F = (v) => v ?? ''

export default function DispatchForm({ dispatch, dispatches, parties, close, onSaved }) {
  const editing = !!dispatch
  const haulers = parties.filter((p) => ['Freight', 'Rail Freight'].includes(p.group?.name))
  const buyers = parties.filter((p) => p.group?.name === 'Trailer Buyer')
  const [f, setF] = useState({
    hauler_party_id: dispatch?.hauler?.id ?? '',
    hauler_contact: F(dispatch?.hauler_contact),
    pickup_location: F(dispatch?.pickup_location),
    pickup_address: F(dispatch?.pickup_address),
    destination_party_id: dispatch?.destination?.id ?? '',
    destination_address: F(dispatch?.destination_address),
    scheduled_pickup: F(dispatch?.scheduled_pickup),
    delivery_eta: F(dispatch?.delivery_eta),
    rate: F(dispatch?.rate),
    rate_basis: dispatch?.rate_basis ?? 'flat',
    notes: F(dispatch?.notes),
    cancelled: dispatch?.cancelled ?? false,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const fields = {
        ...f,
        hauler_party_id: f.hauler_party_id || null,
        destination_party_id: f.destination_party_id || null,
        scheduled_pickup: f.scheduled_pickup || null,
        delivery_eta: f.delivery_eta || null,
        rate: f.rate === '' ? null : Number(f.rate),
      }
      if (!editing) fields.dispatch_number = nextDispatchNumber(dispatches)
      await saveDispatch(fields, dispatch?.id)
      onSaved()
    } catch (ex) {
      setErr(ex.message); setBusy(false)
    }
  }

  return (
    <Modal title={editing ? `Edit ${dispatch.dispatch_number}` : 'New dispatch'} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Hauler</label>
            <SearchSelect autoFocus placeholder="Type to find a hauler…" style={{ width: '100%' }}
              options={haulers.map((h) => ({ id: h.id, label: h.name }))}
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
            <input value={f.pickup_address} onChange={set('pickup_address')} />
          </div>
          <div className="field">
            <label>Destination (buying yard)</label>
            <SearchSelect placeholder="Type to find the yard…" style={{ width: '100%' }}
              options={buyers.map((b) => ({ id: b.id, label: b.name }))}
              value={f.destination_party_id}
              onChange={(v) => setF({ ...f, destination_party_id: v })} />
          </div>
          <div className="field">
            <label>Destination address</label>
            <input value={f.destination_address} onChange={set('destination_address')} placeholder="defaults to the yard’s billing address" />
          </div>
          <div className="field">
            <label>Scheduled pickup</label>
            <input type="date" value={f.scheduled_pickup} onChange={set('scheduled_pickup')} />
          </div>
          <div className="field">
            <label>Delivery ETA</label>
            <input type="date" value={f.delivery_eta} onChange={set('delivery_eta')} />
          </div>
          <div className="field">
            <label>Rate ($)</label>
            <input type="number" step="any" min="0" value={f.rate} onChange={set('rate')} />
          </div>
          <div className="field">
            <label>Rate basis</label>
            <select value={f.rate_basis} onChange={set('rate_basis')}>
              <option value="flat">flat</option>
              <option value="per_unit">per unit</option>
              <option value="per_mile">per mile</option>
            </select>
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
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create dispatch'}</button>
        </div>
      </form>
    </Modal>
  )
}
