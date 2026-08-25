import { useState } from 'react'
import Modal from './Modal'
import { saveParty, saveContact, saveDeduction, deleteDeduction } from '../lib/api'

const F = (v) => v ?? ''
const newContact = () => ({ id: null, name: '', email: '', phone: '', is_default: false, active: true, _dirty: true })
const newDeduction = () => ({ id: null, description: '', kind: 'weight', basis: 'per_unit', rate: '', _dirty: true })

export default function PartyForm({ party, groups, close, onSaved }) {
  const editing = !!party
  const [contacts, setContacts] = useState(
    (party?.contacts || []).map((c) => ({ ...c, _dirty: false })),
  )
  const setContact = (i, key, value) => {
    const next = contacts.slice()
    next[i] = { ...next[i], [key]: value, _dirty: true }
    setContacts(next)
  }
  const [deds, setDeds] = useState(
    (party?.deductions || []).map((d) => ({ ...d, _dirty: false })),
  )
  const [removedDeds, setRemovedDeds] = useState([])
  const setDed = (i, key, value) => {
    const next = deds.slice()
    next[i] = { ...next[i], [key]: value, _dirty: true }
    setDeds(next)
  }
  const removeDed = (i) => {
    if (deds[i].id) setRemovedDeds([...removedDeds, deds[i].id])
    setDeds(deds.filter((_, j) => j !== i))
  }
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
    report_recipients: F(party?.report_recipients),
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
      if (editing) {
        for (const c of contacts) {
          if (!c._dirty || (!c.id && !c.name.trim())) continue
          const { _dirty, id, ...fields } = c
          await saveContact(id ? fields : { ...fields, party_id: party.id }, id)
        }
        for (const id of removedDeds) await deleteDeduction(id)
        for (const d of deds) {
          if (!d._dirty || d.rate === '' || !d.description.trim()) continue
          const { _dirty, id, ...fields } = d
          await saveDeduction(id ? { ...fields, rate: Number(fields.rate) } : { ...fields, rate: Number(fields.rate), party_id: party.id }, id)
        }
      }
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
          <div className="field full">
            <label>Report recipients (inventory-report email list)</label>
            <textarea value={f.report_recipients} onChange={set('report_recipients')}
              placeholder="one email per line or comma-separated — e.g. the FedEx managers list" />
          </div>

          {editing && (
            <div className="field full">
              <label>Standard deduction schedule</label>
              <div className="fieldnote" style={{ marginBottom: 6 }}>
                Weight rows reduce billable pounds before pricing; dollar rows subtract after.
                Applied to suggestions only when the deduction model above is <b>Standard</b>.
              </div>
              {deds.map((d, i) => (
                <div key={d.id ?? `new-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input style={{ flex: 3 }} placeholder="Description (Wood floor, Tires…)" value={F(d.description)} onChange={(e) => setDed(i, 'description', e.target.value)} />
                  <select style={{ flex: 2 }} value={d.kind} onChange={(e) => setDed(i, 'kind', e.target.value)}>
                    <option value="weight">lbs</option>
                    <option value="dollars">dollars</option>
                  </select>
                  <select style={{ flex: 2 }} value={d.basis} onChange={(e) => setDed(i, 'basis', e.target.value)}>
                    <option value="per_unit">per unit</option>
                    <option value="per_tire">per tire</option>
                  </select>
                  <input style={{ flex: 2 }} type="number" step="any" min="0" placeholder="Rate" value={F(d.rate)} onChange={(e) => setDed(i, 'rate', e.target.value)} />
                  <button type="button" title="Remove"
                    style={{ background: 'none', border: 0, color: 'var(--ink-soft)', fontSize: 14 }}
                    onClick={() => removeDed(i)}>×</button>
                </div>
              ))}
              <button type="button" className="btn ghost sm" onClick={() => setDeds([...deds, newDeduction()])}>+ Add deduction</button>
            </div>
          )}

          {editing && (
            <div className="field full">
              <label>Contacts</label>
              {contacts.map((c, i) => (
                <div key={c.id ?? `new-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', opacity: c.active === false ? 0.45 : 1 }}>
                  <input style={{ flex: 2 }} placeholder="Name" value={F(c.name)} onChange={(e) => setContact(i, 'name', e.target.value)} />
                  <input style={{ flex: 3 }} placeholder="Email" value={F(c.email)} onChange={(e) => setContact(i, 'email', e.target.value)} />
                  <input style={{ flex: 2 }} placeholder="Phone" value={F(c.phone)} onChange={(e) => setContact(i, 'phone', e.target.value)} />
                  <label className="checkline" style={{ padding: 0, fontSize: 11.5, whiteSpace: 'nowrap' }} title="Default contact">
                    <input type="checkbox" checked={!!c.is_default} onChange={(e) => setContact(i, 'is_default', e.target.checked)} /> def
                  </label>
                  <button type="button" title={c.active === false ? 'Reactivate' : 'Deactivate'}
                    style={{ background: 'none', border: 0, color: 'var(--ink-soft)', fontSize: 14 }}
                    onClick={() => setContact(i, 'active', c.active === false)}>
                    {c.active === false ? '↺' : '×'}
                  </button>
                </div>
              ))}
              <button type="button" className="btn ghost sm" onClick={() => setContacts([...contacts, newContact()])}>+ Add contact</button>
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  )
}
