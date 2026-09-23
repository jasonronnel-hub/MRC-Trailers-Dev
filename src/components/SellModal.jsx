import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import SearchSelect from './SearchSelect'
import PartyForm from './PartyForm'
import Pill from './Pill'
import DeductionsEditor, { deductionLabel } from './DeductionsEditor'
import { sellUnits, nextOrderNumber, priceEquivalents, LB_PER, formatPrice, DEDUCTION_LABELS, unitLocation } from '../lib/api'
import { buyerOverdue, money } from '../lib/ar'

// One-step sale. TJ's ROM flow was: create the buyer (via Janet), create the
// sales order, go back to each unit and attach it. Here the units are
// already chosen when the form opens; buyer + price + go. Everything else
// (sold_to, status flip, sale date, audit log) happens in the attach trigger.
//
// The recurring terms TJ used to type into notes — deductions, payment
// terms, title — are fields on the order, defaulted from the buyer's record
// and editable per deal. Notes stay for the exceptions.

const REF_RE = /^[A-Z]{3} \d{2}$/
const defaultRef = () => {
  const d = new Date()
  return `${d.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${String(d.getFullYear()).slice(2)}`
}
const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })

// Pounds a unit will most likely settle at: confirmed scale weight, else the
// ticket net, else the reference weight. Estimate only — Katherine settles.
// ROM carries placeholder scale weights (1 lb on some FedEx tractors); a
// trailer or tractor never really weighs under 500 lb, so treat those as
// "no scale weight yet" and fall back to the reference weight.
const real = (w) => (w != null && Number(w) >= 500 ? Number(w) : null)
const basisLbs = (u) => real(u.confirmed_net) ?? real(u.net_wt) ?? real(u.ref_weight_lbs) ?? null
const basisLabel = (u) => (real(u.confirmed_net) != null ? 'confirmed' : real(u.net_wt) != null ? 'net' : real(u.ref_weight_lbs) != null ? 'ref' : null)

// Same math as suggestedUnitAmount, on the deal being built: weight
// deductions come off the pounds first, dollar deductions off the money.
export function estimateAmount(price, unit, lbs, deductions = [], tireCount = null) {
  if (price == null || price === '') return null
  if (unit === 'flat') return Number(price)
  if (lbs == null) return null
  let wt = lbs
  for (const d of deductions) {
    if (d.kind !== 'weight' || d.rate === '') continue
    if (d.basis === 'per_unit') wt -= Number(d.rate)
    else if (d.basis === 'per_tire' && tireCount != null) wt -= Number(d.rate) * tireCount
  }
  wt = Math.max(0, wt)
  const per = LB_PER[unit]
  let amount = per ? (Number(price) * wt) / per : Number(price) * wt
  for (const d of deductions) {
    if (d.kind !== 'dollars' || d.rate === '') continue
    if (d.basis === 'per_unit') amount -= Number(d.rate)
    else if (d.basis === 'per_lb') amount -= Number(d.rate) * wt
    else if (d.basis === 'per_tire' && tireCount != null) amount -= Number(d.rate) * tireCount
  }
  return Math.max(0, amount)
}

// "$190 / GT ≈ $0.0848/lb · $169.64/NT · $186.99/MT" — the three tons and
// pounds side by side so quotes in different units can be compared.
export function PriceEquivalents({ price, unit }) {
  const eq = priceEquivalents(price, unit)
  if (!eq) return null
  const parts = [
    unit !== 'per_lb' && `$${eq.per_lb.toFixed(4)}/lb`,
    unit !== 'per_nt' && `$${fmt(eq.per_nt)}/NT`,
    unit !== 'per_gt' && `$${fmt(eq.per_gt)}/GT`,
    unit !== 'per_mt' && `$${fmt(eq.per_mt)}/MT`,
  ].filter(Boolean)
  return <div className="fieldnote">= {parts.join(' · ')}</div>
}

// Commodity picker over ROM's own code set. Inactive codes only appear when
// they are the current value (legacy orders).
export function CommoditySelect({ value, onChange, commodityCodes = [], autoFocus }) {
  const list = commodityCodes.filter((c) => c.active || c.code === value)
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}>
      <option value="">— none —</option>
      {list.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
    </select>
  )
}

export default function SellModal({ units, data, close, onSaved, refresh }) {
  const { parties, orders, groups, paymentTerms = [], commodityCodes = [], invoices = [] } = data
  const buyers = parties.filter((p) => p.group?.name === 'Trailer Buyer')
  const first = units[0]
  const [f, setF] = useState({
    buyer_party_id: '',
    existing_order_id: '',
    customer_reference: defaultRef(),
    item_code: first?.commodity_code ?? first?.equipment_type?.item_code ?? '',
    price: '',
    price_unit: 'per_lb',
    ref_weight_lbs: first?.ref_weight_lbs ?? '',
    payment_terms_id: '',
    title_required_with_delivery: false,
    title_notes: '',
    header_notes: '',
  })
  const [deds, setDeds] = useState([])
  const [newBuyer, setNewBuyer] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const buyer = buyers.find((b) => String(b.id) === String(f.buyer_party_id))
  // Buyer chosen → the deal starts from the buyer's standing terms.
  useEffect(() => {
    if (!buyer) return
    setF((p) => ({
      ...p,
      payment_terms_id: buyer.payment_terms?.id ?? '',
      title_required_with_delivery: !!buyer.title_required_with_delivery,
    }))
    setDeds(buyer.deduction_model === 'standard'
      ? (buyer.deductions || []).map((d) => ({ description: d.description, kind: d.kind, basis: d.basis, rate: d.rate }))
      : [])
  }, [buyer?.id])   // eslint-disable-line react-hooks/exhaustive-deps

  const openOrders = useMemo(
    () => orders.filter((o) => o.open && String(o.buyer?.id) === String(f.buyer_party_id)),
    [orders, f.buyer_party_id],
  )
  const existing = openOrders.find((o) => String(o.id) === String(f.existing_order_id))
  const price = existing ? existing.price : (f.price === '' ? null : Number(f.price))
  const priceUnit = existing ? existing.price_unit : f.price_unit
  const activeDeds = existing ? (existing.deductions || []) : deds
  const refValue = f.customer_reference.toUpperCase()
  const refOk = refValue === '' || REF_RE.test(refValue)
  const overdue = buyer ? buyerOverdue(invoices, buyer.id, buyer.payment_terms?.name) : null

  const rows = units.map((u) => ({ u, lbs: basisLbs(u), basis: basisLabel(u), est: estimateAmount(price, priceUnit, basisLbs(u), activeDeds, u.tire_count) }))
  const total = rows.length && rows.every((r) => r.est != null) ? rows.reduce((s, r) => s + r.est, 0) : null

  const submit = async (e) => {
    e.preventDefault()
    if (!existing && !refOk) { setErr('Customer reference must look like "AUG 26" (3-letter month, 2-digit year).'); return }
    setBusy(true); setErr('')
    try {
      const result = await sellUnits({
        orderId: existing?.id ?? null,
        order: existing ? null : {
          order_number: nextOrderNumber(orders),
          buyer_party_id: f.buyer_party_id,
          customer_reference: refValue || null,
          item_code: f.item_code || null,
          price,
          price_unit: f.price_unit,
          ref_weight_lbs: f.ref_weight_lbs === '' ? null : parseInt(f.ref_weight_lbs, 10),
          payment_terms_id: f.payment_terms_id || null,
          title_required_with_delivery: !!f.title_required_with_delivery,
          title_notes: f.title_notes || null,
          header_notes: f.header_notes || null,
          open: true,
        },
        deductions: existing ? [] : deds,
        unitIds: units.map((u) => u.id),
      })
      onSaved({ orderNumber: existing?.order_number ?? result.order_number, buyerName: buyer?.name, count: units.length })
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  const n = units.length
  return (
    <Modal title={n === 1 ? `Sell ${first.unit_number || `W${first.legacy_bwt_id ?? first.id}`}` : `Sell ${n} units`} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="est-list">
          {rows.map(({ u, lbs, basis, est }) => (
            <div key={u.id} className="est-row">
              <span className="ticket">W{u.legacy_bwt_id ?? u.id}</span>
              <b>{u.unit_number || '—'}</b>
              <span className="muted">{u.equipment_type?.name || '—'}</span>
              <span className="muted">{unitLocation(u) || ''}</span>
              <Pill status={u.status?.name} />
              <span className="amt muted">
                {lbs != null ? `${fmt(lbs)} lb (${basis})` : 'no weight'}
                {est != null && <> · <b style={{ color: 'var(--ink)' }}>{money(est)}</b></>}
              </span>
            </div>
          ))}
          {total != null && n > 1 && (
            <div className="est-row" style={{ background: 'var(--panel)' }}>
              <span className="muted">Estimate after deductions</span>
              <span className="amt"><b>{money(total)}</b></span>
            </div>
          )}
        </div>

        <div className="form-grid">
          <div className="field full">
            <label>Buyer *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <SearchSelect autoFocus placeholder="Type to find a buyer…" style={{ flex: 1 }}
                options={buyers.map((b) => ({
                  id: b.id,
                  label: `${b.name}${!b.destruction_agreement_signed ? ' — ⚠ no destruction agmt' : ''}`,
                }))}
                value={f.buyer_party_id}
                onChange={(v) => setF({ ...f, buyer_party_id: v, existing_order_id: '' })} />
              <button type="button" className="btn ghost sm" onClick={() => setNewBuyer(true)}>+ New buyer</button>
            </div>
          </div>

          {buyer && (
            <div className="field full">
              <div className="banner" style={{ marginBottom: 0 }}>
                <b>{buyer.name}</b>
                <span className="muted"> · {buyer.payment_terms?.name || 'terms not set'}{buyer.payment_method ? ` · ${buyer.payment_method}` : ''}</span>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  Standard deductions: {DEDUCTION_LABELS[buyer.deduction_model] || '—'}
                  {(buyer.deductions || []).length > 0 && <span className="muted"> — {buyer.deductions.map(deductionLabel).join('; ')}</span>}
                  {!buyer.deductions?.length && buyer.standard_deductions && <span className="muted"> — {buyer.standard_deductions}</span>}
                </div>
                {buyer.purchase_hot_notes && <div style={{ fontSize: 12.5, marginTop: 2 }}><b>⚑</b> {buyer.purchase_hot_notes}</div>}
              </div>
              {overdue && (
                <div className="banner" style={{ marginTop: 8, marginBottom: 0, background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
                  <b>{buyer.name} is overdue:</b> {overdue.count} open invoice{overdue.count === 1 ? '' : 's'}, {money(overdue.amount)}, oldest {overdue.oldest} days past due.
                </div>
              )}
              {!buyer.destruction_agreement_signed && (
                <div className="banner" style={{ marginTop: 8, marginBottom: 0, background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
                  <b>No destruction agreement on file.</b> Do not ship FedEx/Walmart units until it’s signed.
                </div>
              )}
            </div>
          )}

          {openOrders.length > 0 && (
            <div className="field full">
              <label>Add to</label>
              <select value={f.existing_order_id} onChange={set('existing_order_id')}>
                <option value="">New sales order ({nextOrderNumber(orders)})</option>
                {openOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order_number} · {o.customer_reference || 'no ref'} · {formatPrice(o.price, o.price_unit)}{o.item_code ? ` · ${o.item_code}` : ''}
                  </option>
                ))}
              </select>
              <div className="fieldnote">{buyer?.name} already has {openOrders.length} open order{openOrders.length === 1 ? '' : 's'} — reuse one if this is the same deal.</div>
            </div>
          )}

          {existing ? (
            <div className="field full">
              <div className="banner" style={{ marginBottom: 0 }}>
                Adding to <b>{existing.order_number}</b> at <b>{formatPrice(existing.price, existing.price_unit)}</b>
                {existing.customer_reference && <span className="muted"> · {existing.customer_reference}</span>}
                <span className="muted"> · {existing.payment_terms?.name || 'terms not set'}</span>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  Deductions: {(existing.deductions || []).length ? existing.deductions.map(deductionLabel).join('; ') : <span className="muted">none on this order</span>}
                </div>
                {existing.title_required_with_delivery && <div className="warnrow" style={{ fontSize: 12.5, marginTop: 2 }}>Title must travel with the delivery.</div>}
                <PriceEquivalents price={existing.price} unit={existing.price_unit} />
              </div>
            </div>
          ) : (<>
            <div className="field">
              <label>Price *</label>
              <input type="number" step="any" min="0" value={f.price} onChange={set('price')} placeholder="0.17" required />
            </div>
            <div className="field">
              <label>Price unit</label>
              <select value={f.price_unit} onChange={set('price_unit')}>
                <option value="per_lb">per lb</option>
                <option value="per_nt">per net ton (2,000 lb)</option>
                <option value="per_gt">per gross ton (2,240 lb)</option>
                <option value="per_mt">per metric tonne (2,204.6 lb)</option>
                <option value="flat">flat, per unit</option>
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
              <input value={f.customer_reference} onChange={set('customer_reference')} placeholder="AUG 26"
                style={refOk ? undefined : { borderColor: 'var(--error)' }} />
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
              <label>Deductions on this deal</label>
              <div className="fieldnote" style={{ marginBottom: 6 }}>Starts from the buyer’s standard schedule; edit for this deal. lbs rows come off the weight before pricing, dollar rows off the money after.</div>
              <DeductionsEditor rows={deds} onChange={setDeds} />
            </div>
            <div className="field full">
              <label>Notes</label>
              <textarea value={f.header_notes} onChange={set('header_notes')} placeholder="Anything that isn’t a field above — paste the buyer’s confirmation email here" />
            </div>
          </>)}
        </div>

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy || !f.buyer_party_id || (!existing && f.price === '')}>
            {busy ? 'Selling…' : existing ? `Add ${n} unit${n === 1 ? '' : 's'} to ${existing.order_number}` : `Sell ${n} unit${n === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>

      {newBuyer && (
        <PartyForm party={null} groups={groups} paymentTerms={paymentTerms}
          close={() => setNewBuyer(false)}
          onSaved={(id) => { setNewBuyer(false); setF((p) => ({ ...p, buyer_party_id: id ?? '', existing_order_id: '' })); refresh?.() }} />
      )}
    </Modal>
  )
}
