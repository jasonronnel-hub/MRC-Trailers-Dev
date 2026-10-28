import { useEffect, useState } from 'react'
import Modal from './Modal'
import SearchSelect from './SearchSelect'
import { saveParty, saveContact, saveDeduction, deleteDeduction } from '../lib/api'
import { supabase } from '../lib/supabase'
import DeductionsEditor from './DeductionsEditor'

const F = (v) => v ?? ''
const newContact = () => ({ id: null, name: '', email: '', phone: '', address: '', is_default: false, active: true, _dirty: true })

export default function PartyForm({ party, groups, paymentTerms, close, onSaved }) {
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
    payment_terms_id: party?.payment_terms?.id ?? '',
    payment_method: F(party?.payment_method),
    deduction_model: F(party?.deduction_model),
    standard_deductions: F(party?.standard_deductions),
    destruction_agreement_signed: F(party?.destruction_agreement_signed),
    rema_member: party?.rema_member ?? false,
    merged_parent: party?.merged_parent ?? false,
    title_required_with_delivery: party?.title_required_with_delivery ?? false,
    ready_step_required: party?.ready_step_required ?? false,
    general_notes: F(party?.general_notes),
    trucking_notes: F(party?.trucking_notes),
    purchase_hot_notes: F(party?.purchase_hot_notes),
    report_recipients: F(party?.report_recipients),
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  // New accounts: warn (never block) about similar existing names — Janet used
  // to be the duplicate check when only she could create accounts.
  const [similar, setSimilar] = useState([])
  useEffect(() => {
    if (editing) return
    const words = f.name.trim().replace(/[%,()*]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
    if (f.name.trim().length < 4 || !words.length) { setSimilar([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      // The first two significant words, in order, anywhere in the name.
      const pattern = `%${words.slice(0, 2).join('%')}%`
      const { data } = await supabase.from('parties').select('id, name, city, state, group:party_groups(name)').ilike('name', pattern).eq('active', true).limit(6)
      if (!cancelled) setSimilar(data || [])
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [f.name, editing])   // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const savedId = await saveParty({
        ...f,
        group_id: f.group_id || null,
        payment_terms_id: f.payment_terms_id || null,
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
          const clean = { ...fields, rate: Number(fields.rate), category: fields.category || null, direction: fields.direction || 'deduct' }
          await saveDeduction(id ? clean : { ...clean, party_id: party.id }, id)
        }
      }
      onSaved(savedId ?? party?.id)
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
            {similar.length > 0 && (
              <div className="banner" style={{ marginTop: 6, marginBottom: 0 }}>
                <b>Already in the system?</b> {similar.map((p) => `${p.name}${p.city ? ` (${p.city}${p.state ? ', ' + p.state : ''})` : ''}${p.group?.name ? ` · ${p.group.name}` : ''}`).join(' · ')}
                <div style={{ fontSize: 12.5 }}>Check these before creating a duplicate. You can still save.</div>
              </div>
            )}
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
            <SearchSelect placeholder="Type to find terms…" style={{ width: '100%' }}
              options={paymentTerms.filter((t) => t.active).map((t) => ({ id: t.id, label: t.name }))}
              value={f.payment_terms_id}
              onChange={(v) => setF({ ...f, payment_terms_id: v })} />
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
            <label className="checkline"><input type="checkbox" checked={f.title_required_with_delivery} onChange={set('title_required_with_delivery')} /> Requires title with delivery</label>
            {groups.find((g) => String(g.id) === String(f.group_id))?.name === 'Trailer Supplier' && (
              <label className="checkline" title="FedEx Ground de-identifies units before we may collect them; their units wait in Purchased Not Ready until Kim hears they are ready. Leave off for fleets whose units are ours to sell the day the bill of sale is paid (Walmart, Hub, Milestone, UP…).">
                <input type="checkbox" checked={f.ready_step_required} onChange={set('ready_step_required')} /> Units wait for a ready signal (FedEx Ground style)
              </label>
            )}
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
              <label>Standard adjustment schedule</label>
              <div className="fieldnote" style={{ marginBottom: 6 }}>
                Weight rows reduce billable pounds before pricing; dollar rows subtract after.
                Applied to suggestions only when the deduction model above is <b>Standard</b>.
              </div>
              <DeductionsEditor rows={deds} onChange={(rows) => {
                const keep = new Set(rows.map((r) => r.id).filter(Boolean))
                const gone = deds.filter((r) => r.id && !keep.has(r.id)).map((r) => r.id)
                if (gone.length) setRemovedDeds([...removedDeds, ...gone])
                setDeds(rows.map((r) => ({ ...r, _dirty: true })))
              }} />
            </div>
          )}

          {editing && (
            <div className="field full">
              <label>Contacts &amp; sites</label>
              <div className="fieldnote" style={{ marginBottom: 6 }}>A fleet’s stations are sites here (e.g. “FXG - Portland OR - 972”); the address is what the dispatch form pulls as the pickup address.</div>
              {contacts.map((c, i) => (
                <div key={c.id ?? `new-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', opacity: c.active === false ? 0.45 : 1 }}>
                  <input style={{ flex: 2 }} placeholder="Name" value={F(c.name)} onChange={(e) => setContact(i, 'name', e.target.value)} />
                  <input style={{ flex: 3 }} placeholder="Email" value={F(c.email)} onChange={(e) => setContact(i, 'email', e.target.value)} />
                  <input style={{ flex: 2 }} placeholder="Phone" value={F(c.phone)} onChange={(e) => setContact(i, 'phone', e.target.value)} />
                  <input style={{ flex: 4 }} placeholder="Street address (sites: where trucks pick up)" value={F(c.address)} onChange={(e) => setContact(i, 'address', e.target.value)} />
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
