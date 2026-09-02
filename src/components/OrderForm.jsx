import { useState } from 'react'
import Modal from './Modal'
import SearchSelect from './SearchSelect'
import DeductionsEditor from './DeductionsEditor'
import { PriceEquivalents, CommoditySelect } from './SellModal'
import { saveOrder, nextOrderNumber, replaceOrderDeductions, can } from '../lib/api'

// Customer reference must follow the 'AUG 26' convention (Spec §2.4: enforce
// format in UI). Blank is allowed; anything else must be MMM YY.
const REF_RE = /^[A-Z]{3} \d{2}$/
const defaultRef = () => {
  const d = new Date()
  const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  return `${mon} ${String(d.getFullYear()).slice(2)}`
}

export default function OrderForm({ order, orders, parties, paymentTerms = [], commodityCodes = [], role, close, onSaved }) {
  const editing = !!order
  const buyers = parties.filter((p) => p.group?.name === 'Trailer Buyer')
  const [f, setF] = useState({
    buyer_party_id: order?.buyer?.id ?? '',
    customer_reference: order?.customer_reference ?? defaultRef(),
    item_code: order?.item_code ?? '',
    price: order?.price ?? '',
    price_unit: order?.price_unit ?? 'per_lb',
    ref_weight_lbs: order?.ref_weight_lbs ?? '',
    payment_terms_id: order?.payment_terms?.id ?? '',
    title_required_with_delivery: order?.title_required_with_delivery ?? false,
    title_notes: order?.title_notes ?? '',
    header_notes: order?.header_notes ?? '',
    detail_notes: order?.detail_notes ?? '',
    open: order?.open ?? true,
  })
  const [deds, setDeds] = useState((order?.deductions || []).map((d) => ({ ...d })))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const buyer = buyers.find((b) => String(b.id) === String(f.buyer_party_id))
  const refValue = f.customer_reference.toUpperCase()
  const refOk = refValue === '' || REF_RE.test(refValue)

  // New order for a buyer with standard deductions: start from their schedule.
  const pickBuyer = (v) => {
    const b = buyers.find((x) => String(x.id) === String(v))
    setF((p) => ({
      ...p,
      buyer_party_id: v,
      payment_terms_id: editing ? p.payment_terms_id : (b?.payment_terms?.id ?? ''),
      title_required_with_delivery: editing ? p.title_required_with_delivery : !!b?.title_required_with_delivery,
    }))
    if (!editing && b?.deduction_model === 'standard') {
      setDeds((b.deductions || []).map((d) => ({ description: d.description, kind: d.kind, basis: d.basis, rate: d.rate })))
    }
  }

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
        payment_terms_id: f.payment_terms_id || null,
        title_required_with_delivery: !!f.title_required_with_delivery,
        title_notes: f.title_notes || null,
        header_notes: f.header_notes || null,
        detail_notes: f.detail_notes || null,
        open: f.open,
        closed_at: f.open ? null : (order?.closed_at ?? new Date().toISOString()),
      }
      if (!editing) fields.order_number = nextOrderNumber(orders)
      const id = await saveOrder(fields, order?.id)
      if (can(role, 'editOrderDeductions')) await replaceOrderDeductions(id, deds)
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
            <SearchSelect autoFocus placeholder="Type to find a buyer…" style={{ width: '100%' }}
              options={buyers.map((b) => ({
                id: b.id,
                label: `${b.name}${!b.destruction_agreement_signed ? ' — ⚠ no destruction agmt' : ''}`,
              }))}
              value={f.buyer_party_id}
              onChange={pickBuyer} />
            {buyer?.title_required_with_delivery && !f.title_required_with_delivery && (
              <div className="fieldnote warnrow">This buyer normally requires the title with delivery.</div>
            )}
          </div>
          <div className="field">
            <label>Price</label>
            <input type="number" step="any" min="0" value={f.price} onChange={set('price')} placeholder="0.17" />
          </div>
          <div className="field">
            <label>Price unit</label>
            <select value={f.price_unit} onChange={set('price_unit')}>
              <option value="per_lb">per lb</option>
              <option value="per_nt">per net ton (2,000 lb)</option>
              <option value="per_gt">per gross ton (2,240 lb)</option>
              <option value="per_mt">per metric tonne (2,204.6 lb)</option>
              <option value="flat">flat</option>
            </select>
            <PriceEquivalents price={f.price} unit={f.price_unit} />
          </div>
          <div className="field">
            <label>Commodity</label>
            <CommoditySelect value={f.item_code} onChange={(v) => setF({ ...f, item_code: v })} commodityCodes={commodityCodes} />
          </div>
          <div className="field">
            <label>Payment terms</label>
            <select value={f.payment_terms_id} onChange={set('payment_terms_id')}>
              <option value="">— not set —</option>
              {paymentTerms.filter((t) => t.active || String(t.id) === String(f.payment_terms_id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Customer reference</label>
            <input value={f.customer_reference} onChange={set('customer_reference')}
              placeholder="AUG 26" style={refOk ? undefined : { borderColor: 'var(--error)' }} />
            {!refOk && <div className="fieldnote" style={{ color: 'var(--error)' }}>Format: 3-letter month + 2-digit year, e.g. AUG 26</div>}
          </div>
          <div className="field">
            <label>Reference weight (lb)</label>
            <input type="number" min="0" value={f.ref_weight_lbs} onChange={set('ref_weight_lbs')} placeholder="8500" />
            <div className="fieldnote">Katherine’s invoice spot-check flag.</div>
          </div>
          <div className="field full">
            <label className="checkline"><input type="checkbox" checked={f.title_required_with_delivery} onChange={set('title_required_with_delivery')} /> Title must travel with the delivery</label>
            <input value={f.title_notes} onChange={set('title_notes')} placeholder="Title notes for Kim — e.g. original title only, BOS not accepted" />
          </div>
          <div className="field full">
            <label>Deductions on this order</label>
            <div className="fieldnote" style={{ marginBottom: 6 }}>lbs rows come off the weight before pricing, dollar rows off the money after. Notes below are for the exceptions.</div>
            <DeductionsEditor rows={deds} onChange={setDeds} />
          </div>
          {editing && (
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label className="checkline"><input type="checkbox" checked={f.open} onChange={set('open')} /> Order open</label>
            </div>
          )}
          <div className="field full">
            <label>Notes</label>
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
