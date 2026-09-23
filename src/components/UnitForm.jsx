import { useState } from 'react'
import Modal from './Modal'
import SearchSelect from './SearchSelect'
import { saveUnit } from '../lib/api'
import { CommoditySelect } from './SellModal'

const F = (v) => v ?? ''

export default function UnitForm({ unit, statuses, equipTypes, titleTypes, parties, commodityCodes = [], makes = [], close, onSaved }) {
  const editing = !!unit
  const suppliers = parties.filter((p) => p.group?.name === 'Trailer Supplier')
  const [f, setF] = useState({
    unit_number: F(unit?.unit_number),
    alt_unit_number: F(unit?.alt_unit_number),
    vin: F(unit?.vin),
    equipment_type_id: unit?.equipment_type
      ? equipTypes.find((t) => t.name === unit.equipment_type.name)?.id ?? ''
      : '',
    source_party_id: unit?.source?.id ?? '',
    status_id: unit?.status?.id ?? statuses.find((s) => s.name === 'Purchased Not Ready')?.id,
    title_type_id: unit?.title_type
      ? titleTypes.find((t) => t.name === unit.title_type.name)?.id ?? ''
      : titleTypes.find((t) => t.name === 'Original')?.id ?? '',
    title_received: unit?.title_received ?? false,
    title_received_date: F(unit?.title_received_date),
    model_year: F(unit?.model_year),
    make_id: unit?.make ? (makes.find((m) => m.name === unit.make.name)?.id ?? '') : '',
    replacement_for: F(unit?.replacement_for),
    scheduled_date: F(unit?.scheduled_date), pickup_date: F(unit?.pickup_date), completion_date: F(unit?.completion_date),
    title_sent_date: F(unit?.title_sent_date),
    title_tracking_num: F(unit?.title_tracking_num),
    physical_location: F(unit?.physical_location),
    pickup_location_code: F(unit?.pickup_location_code),
    pickup_address: F(unit?.pickup_address),
    purchase_price: F(unit?.purchase_price),
    purchase_rate: F(unit?.purchase_rate),
    purchase_rate_unit: unit?.purchase_rate_unit ?? 'per_lb',
    purchase_date: F(unit?.purchase_date) || (unit ? '' : new Date().toISOString().slice(0, 10)),
    purchase_order_ref: F(unit?.purchase_order_ref),
    commodity_code: F(unit?.commodity_code),
    ref_weight_lbs: F(unit?.ref_weight_lbs),
    condition_comments: F(unit?.condition_comments),
    material_type: F(unit?.material_type),
    voided: unit?.voided ?? false,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const pickEquip = (e) => {
    const id = e.target.value
    const t = equipTypes.find((x) => String(x.id) === id)
    // Auto-fill the reference weight from the equipment type default, but only
    // when the field is empty or still holding the previous type's default.
    const prev = equipTypes.find((x) => String(x.id) === String(f.equipment_type_id))
    const shouldFill = f.ref_weight_lbs === '' || (prev && String(f.ref_weight_lbs) === String(prev.default_ref_weight_lbs ?? ''))
    // Commodity follows the type's ROM code unless one was already chosen.
    setF({ ...f, equipment_type_id: id, ref_weight_lbs: shouldFill ? F(t?.default_ref_weight_lbs) : f.ref_weight_lbs,
      commodity_code: f.commodity_code || F(t?.item_code) })
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await saveUnit({
        unit_number: f.unit_number || null,
        alt_unit_number: f.alt_unit_number || null,
        vin: f.vin || null,
        equipment_type_id: f.equipment_type_id || null,
        source_party_id: f.source_party_id || null,
        status_id: f.status_id,
        title_type_id: f.title_type_id || null,
        title_received: f.title_received,
        title_received_date: f.title_received_date || null,
        model_year: f.model_year === '' ? null : parseInt(f.model_year, 10),
        make_id: f.make_id || null,
        replacement_for: f.replacement_for || null,
        scheduled_date: f.scheduled_date || null, pickup_date: f.pickup_date || null, completion_date: f.completion_date || null,
        title_sent_date: f.title_sent_date || null,
        title_tracking_num: f.title_tracking_num || null,
        physical_location: f.physical_location || null,
        pickup_location_code: f.pickup_location_code || null,
        pickup_address: f.pickup_address || null,
        purchase_price: f.purchase_price === '' ? null : Number(f.purchase_price),
        purchase_rate: f.purchase_rate === '' ? null : Number(f.purchase_rate),
        purchase_rate_unit: f.purchase_rate === '' ? null : f.purchase_rate_unit,
        purchase_date: f.purchase_date || null,
        purchase_order_ref: f.purchase_order_ref || null,
        commodity_code: f.commodity_code || null,
        ref_weight_lbs: f.ref_weight_lbs === '' ? null : parseInt(f.ref_weight_lbs, 10),
        condition_comments: f.condition_comments || null,
        material_type: f.material_type || null,
        voided: f.voided,
      }, unit?.id)
      onSaved()
    } catch (ex) {
      setErr(ex.message); setBusy(false)
    }
  }

  return (
    <Modal title={editing ? `Edit ${unit.unit_number || 'unit'}` : 'New unit'} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Unit #</label>
            <input value={f.unit_number} onChange={set('unit_number')} autoFocus />
          </div>
          <div className="field">
            <label>Alt unit #</label>
            <input value={f.alt_unit_number} onChange={set('alt_unit_number')} />
          </div>
          <div className="field full">
            <label>VIN</label>
            <input value={f.vin} onChange={set('vin')} className="mono" />
          </div>
          <div className="field">
            <label>Year</label>
            <input type="number" min="1950" max="2100" value={f.model_year} onChange={set('model_year')} placeholder="2017" />
          </div>
          <div className="field">
            <label>Make</label>
            <select value={f.make_id} onChange={set('make_id')}>
              <option value="">—</option>
              {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Equipment type</label>
            <select value={f.equipment_type_id} onChange={pickEquip}>
              <option value="">—</option>
              {equipTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Source (fleet)</label>
            <SearchSelect placeholder="Type to find the fleet…" style={{ width: '100%' }}
              options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
              value={f.source_party_id}
              onChange={(v) => setF({ ...f, source_party_id: v })} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={f.status_id} onChange={set('status_id')}>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {editing && <div className="fieldnote">Changes are audit-logged. Attaching to a sales order sets Sold automatically.</div>}
          </div>
          <div className="field">
            <label>Title</label>
            <select value={f.title_type_id} onChange={set('title_type_id')}>
              {titleTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label className="checkline" style={{ marginTop: 4 }}>
              <input type="checkbox" checked={f.title_received} onChange={set('title_received')} /> Title received
            </label>
            {f.title_received && <input type="date" value={f.title_received_date} onChange={set('title_received_date')} title="Title received date" />}
          </div>
          <div className="field">
            <label>Title/BOS sent (Traci’s FedEx workflow)</label>
            <input type="date" value={f.title_sent_date} onChange={set('title_sent_date')} />
            <input style={{ marginTop: 4 }} className="mono" value={f.title_tracking_num}
              onChange={set('title_tracking_num')} placeholder="FedEx tracking #" />
          </div>
          <div className="field">
            <label>Physical location</label>
            <input value={f.physical_location} onChange={set('physical_location')} placeholder="City, ST" />
          </div>
          <div className="field">
            <label>Pickup location code</label>
            <input value={f.pickup_location_code} onChange={set('pickup_location_code')} />
          </div>
          <div className="field full">
            <label>Pickup address</label>
            <input value={f.pickup_address} onChange={set('pickup_address')} />
          </div>
          <div className="field">
            <label>Commodity (ROM code)</label>
            <CommoditySelect value={f.commodity_code} onChange={(v) => setF({ ...f, commodity_code: v })} commodityCodes={commodityCodes} />
          </div>
          <div className="field">
            <label>Purchase date</label>
            <input type="date" value={f.purchase_date} onChange={set('purchase_date')} />
          </div>
          <div className="field">
            <label>Purchase price ($)</label>
            <input type="number" step="any" min="0" value={f.purchase_price} onChange={set('purchase_price')} />
          </div>
          <div className="field">
            <label>Purchase rate</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="number" step="any" min="0" style={{ flex: 1 }} value={f.purchase_rate} onChange={set('purchase_rate')} placeholder="optional" />
              <select style={{ flex: 1 }} value={f.purchase_rate_unit} onChange={set('purchase_rate_unit')}>
                <option value="per_lb">/lb</option><option value="per_nt">/NT</option><option value="per_gt">/GT</option><option value="per_mt">/MT</option><option value="flat">flat</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>PO reference</label>
            <input value={f.purchase_order_ref} onChange={set('purchase_order_ref')} placeholder="supplier PO / bid #" />
          </div>
          <div className="field">
            <label>Ref weight (lb)</label>
            <input type="number" min="0" value={f.ref_weight_lbs} onChange={set('ref_weight_lbs')} />
          </div>
          <div className="field">
            <label>Material (optional)</label>
            <input value={f.material_type} onChange={set('material_type')} placeholder="e.g. Steel – Auto Body" />
            <div className="fieldnote">Free text, used ad-hoc — shows in Kim’s buyer email when set.</div>
          </div>
          {editing && (<>
            <div className="field">
              <label>Pickup date</label>
              <input type="date" value={f.pickup_date} onChange={set('pickup_date')} />
            </div>
            <div className="field">
              <label>Scheduled date</label>
              <input type="date" value={f.scheduled_date} onChange={set('scheduled_date')} />
            </div>
            <div className="field">
              <label>Completed date</label>
              <input type="date" value={f.completion_date} onChange={set('completion_date')} />
              <div className="fieldnote">Set automatically by Mark delivered; edit only to correct it.</div>
            </div>
          </>)}
          <div className="field full">
            <label>Note / replacement for</label>
            <textarea value={f.replacement_for} onChange={set('replacement_for')} placeholder="Dispatch notes (Kim), or the old unit’s info when this is a replacement" />
            <div className="fieldnote">Searchable. Shows at the top of the unit and on dispatch screens.</div>
          </div>
          <div className="field full">
            <label>Condition comments</label>
            <textarea value={f.condition_comments} onChange={set('condition_comments')} />
          </div>
          {editing && (
            <div className="field full">
              <label className="checkline" style={{ color: 'var(--error)' }}>
                <input type="checkbox" checked={f.voided} onChange={set('voided')} />
                Void this ticket (hides it from inventory; the record is kept)
              </label>
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add unit'}</button>
        </div>
      </form>
    </Modal>
  )
}
