import { useState } from 'react'
import Modal from './Modal'
import { saveOrder, nextOrderNumber } from '../lib/api'

// Customer reference must follow the 'AUG 26' convention (Spec §2.4: enforce
// format in UI). Blank is allowed; anything else must be MMM YY.
const REF_RE = /^[A-Z]{3} \d{2}$/
const defaultRef = () => {
  const d = new Date()
  const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  return `${mon} ${String(d.getFullYear()).slice(2)}`
}

export default function OrderForm({ order, orders, parties, equipTypes, close, onSaved }) {
  const editing = !!order
  const buyers = parties.filter((p) => p.group?.name === 'Trailer Buyer')
  const [f, setF] = useState({
    buyer_party_id: order?.buyer?.id ?? '',
    customer_reference: order?.customer_reference ?? defaultRef(),
    item_code: order?.item_code ?? '',
    price: order?.price ?? '',
    price_unit: order?.price_unit ?? 'per_lb',
    ref_weight_lbs: order?.ref_weight_lbs ?? '',
    header_notes: order?.header_notes ?? '',
    detail_notes: order?.detail_notes ?? '',
    open: order?.open ?? true,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const refValue = f.customer_reference.toUpperCase()
  const refOk = refValue === '' || REF_RE.test(refValue)

  const submit = async (e) => {
    e.preventDefault()
    if (!refOk) { setErr('Customer reference must look like "AUG 26" (3-letter month, 2-digit year).'); return }
    setBusy(true); setErr('')
    try {
      const fields = {
        buyer_party_id: f.buyer_party_id,
        customer_reference: refValue || null,
        item_code: f.item_code || null,
        price: f.price === '' ? null : Number(f.price),
        price_unit: f.price_unit,
        ref_weight_lbs: f.ref_weight_lbs === '' ? null : parseInt(f.ref_weight_lbs, 10),
        header_notes: f.header_notes || null,
        detail_notes: f.detail_notes || null,
        open: f.open,
        closed_at: f.open ? null : (order?.closed_at ?? new Date().toISOString()),
      }
      if (!editing) fields.order_number = nextOrderNumber(orders)
      await saveOrder(fields, order?.id)
      onSaved()
    } catch (ex) {
      setErr(ex.message); setBusy(false)
    }
  }

  return (
    <Modal title={editing ? `Edit ${order.order_number}` : 'New sales order'} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label>Buyer *</label>
            <select value={f.buyer_party_id} onChange={set('buyer_party_id')} required autoFocus>
              <option value="">Select a buyer…</option>
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{!b.destruction_agreement_signed ? ' — ⚠ no destruction agmt' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Customer reference</label>
            <input value={f.customer_reference} onChange={set('customer_reference')}
              placeholder="AUG 26" style={refOk ? undefined : { borderColor: 'var(--error)' }} />
            {!refOk && <div className="fieldnote" style={{ color: 'var(--error)' }}>Format: 3-letter month + 2-digit year, e.g. AUG 26</div>}
          </div>
          <div className="field">
            <label>Item code</label>
            <input value={f.item_code} onChange={set('item_code')} list="item-codes" placeholder="7010" />
            <datalist id="item-codes">
              {equipTypes.filter((t) => t.item_code).map((t) => (
                <option key={t.id} value={t.item_code}>{t.name}</option>
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Price</label>
            <input type="number" step="any" min="0" value={f.price} onChange={set('price')} placeholder="0.17" />
          </div>
          <div className="field">
            <label>Price unit</label>
            <select value={f.price_unit} onChange={set('price_unit')}>
              <option value="per_lb">per lb</option>
              <option value="per_ton">per ton</option>
              <option value="flat">flat</option>
            </select>
          </div>
          <div className="field">
            <label>Reference weight (lb)</label>
            <input type="number" min="0" value={f.ref_weight_lbs} onChange={set('ref_weight_lbs')} placeholder="8500" />
            <div className="fieldnote">Katherine’s invoice spot-check flag.</div>
          </div>
          {editing && (
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label className="checkline"><input type="checkbox" checked={f.open} onChange={set('open')} /> Order open</label>
            </div>
          )}
          <div className="field full">
            <label>Header notes</label>
            <textarea value={f.header_notes} onChange={set('header_notes')}
              placeholder="Paste the buyer’s confirmation email here" />
          </div>
          <div className="field full">
            <label>Detail notes</label>
            <textarea value={f.detail_notes} onChange={set('detail_notes')} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy || !f.buyer_party_id}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create order'}</button>
        </div>
      </form>
    </Modal>
  )
}
