import { useState } from 'react'
import Modal from './Modal'
import { saveParty } from '../lib/api'

const F = (v) => v ?? ''

export default function PartyForm({ party, groups, close, onSaved }) {
  const editing = !!party
  const [f, setF] = useState({
    name: F(party?.name),
    group_id: party?.group?.id ?? groups.find((g) => g.name === 'Trailer Buyer')?.id ?? '',
    billing_address: F(party?.billing_address),
    payment_terms: F(party?.payment_terms),
    payment_method: F(party?.payment_method),
    deduction_model: F(party?.deduction_model),
    standard_deductions: F(party?.standard_deductions),
    destruction_agreement_signed: F(party?.destruction_agreement_signed),
    rema_member: party?.rema_member ?? false,
    merged_parent: party?.merged_parent ?? false,
    general_notes: F(party?.general_notes),
    trucking_notes: F(party?.trucking_notes),
    purchase_hot_notes: F(party?.purchase_hot_notes),
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await saveParty({
        ...f,
        group_id: f.group_id || null,
        deduction_model: f.deduction_model || null,
        destruction_agreement_signed: f.destruction_agreement_signed || null,
      }, party?.id)
      onSaved()
    } catch (ex) {
      setErr(ex.message); setBusy(false)
    }
  }

  return (
    <Modal title={editing ? `Edit ${party.name}` : 'New buyer / account'} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label>Company name *</label>
            <input value={f.name} onChange={set('name')} required autoFocus />
          </div>
          <div className="field">
            <label>Group</label>
            <select value={f.group_id} onChange={set('group_id')}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Billing address</label>
            <input value={f.billing_address} onChange={set('billing_address')} placeholder="City, ST" />
          </div>
          <div className="field">
            <label>Payment terms</label>
            <input value={f.payment_terms} onChange={set('payment_terms')} placeholder="Net 30" />
          </div>
          <div className="field">
            <label>Payment method</label>
            <input value={f.payment_method} onChange={set('payment_method')} placeholder="ACH / Check" />
          </div>
          <div className="field">
            <label>Deduction model</label>
            <select value={f.deduction_model} onChange={set('deduction_model')}>
              <option value="">—</option>
              <option value="none">No Deductions</option>
              <option value="standard">Standard</option>
              <option value="variable">Variable</option>
            </select>
          </div>
          <div className="field">
            <label>Standard deductions</label>
            <input value={f.standard_deductions} onChange={set('standard_deductions')} placeholder="Wood floor 2,000 lb; tires $10/ea" />
          </div>
          <div className="field">
            <label>Destruction agreement signed</label>
            <input type="date" value={f.destruction_agreement_signed} onChange={set('destruction_agreement_signed')} />
            <div className="fieldnote">Leave blank if none on file — the account will be red-flagged.</div>
          </div>
          <div className="field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <label className="checkline"><input type="checkbox" checked={f.rema_member} onChange={set('rema_member')} /> REMA member</label>
            <label className="checkline"><input type="checkbox" checked={f.merged_parent} onChange={set('merged_parent')} /> Merged parent (central billing)</label>
          </div>
          <div className="field full">
            <label>General notes</label>
            <textarea value={f.general_notes} onChange={set('general_notes')} />
          </div>
          <div className="field">
            <label>Kim’s trucking notes</label>
            <textarea value={f.trucking_notes} onChange={set('trucking_notes')} />
          </div>
          <div className="field">
            <label>Pop-up warning (hot note)</label>
            <textarea value={f.purchase_hot_notes} onChange={set('purchase_hot_notes')} placeholder="Shown as a must-see warning on the account" />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  )
}
