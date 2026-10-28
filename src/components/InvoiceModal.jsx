import { useMemo, useState } from 'react'
import Modal from './Modal'
import Pill from './Pill'
import { invoiceUnits, nextInvoiceNumber, unitInvoiceBreakdown, breakdownsToLines, linesTotal, unitLocation, saveUnit } from '../lib/api'
import { dueDate, money } from '../lib/ar'
import { deductionLabel, categoryLabel } from './DeductionsEditor'
import { docGate } from '../lib/docs'
import DocGateRow from './DocGateRow'

// One-step invoice from Inventory: the delivered units are already chosen;
// buyer, terms, due date and a suggested amount come from them. Katherine
// still owns the number — the suggestion is a starting point, editable.
export default function InvoiceModal({ units: unitsIn, data, close, onSaved }) {
  const { parties, invoices } = data
  // Document states edited right here (received / exception) overlay the
  // snapshot the grid handed us, so the gate re-evaluates without a reload.
  const [docEdits, setDocEdits] = useState({})
  const units = unitsIn.map((u) => (docEdits[u.id] ? { ...u, ...docEdits[u.id] } : u))
  const setDocs = async (u, fields) => {
    await saveUnit(fields, u.id)
    setDocEdits((d) => ({ ...d, [u.id]: { ...(d[u.id] || {}), ...fields } }))
  }
  const gates = units.map((u) => ({ u, gate: docGate(u) }))
  const blocked = gates.filter((g) => !g.gate.ok).length
  const buyers = parties.filter((p) => p.group?.name === 'Trailer Buyer')
  const buyerIds = [...new Set(units.map((u) => u.sold_to?.id).filter(Boolean))]
  const buyer = buyerIds.length === 1 ? buyers.find((b) => b.id === buyerIds[0]) : null
  const deductions = buyer?.deduction_model === 'standard' ? (buyer.deductions || []) : []
  const today = new Date().toISOString().slice(0, 10)
  const termsName = buyer?.payment_terms?.name || ''

  const rows = units.map((u) => { const b = unitInvoiceBreakdown(u, deductions); return { u, b, est: b?.total ?? null } })
  const suggested = rows.every((r) => r.est != null) ? linesTotal(rows) : null

  const [f, setF] = useState({
    existing_invoice_id: '',
    invoice_date: today,
    terms: termsName,
    due_date: dueDate({ invoice_date: today, terms: termsName }, termsName) || '',
    amount: suggested != null ? suggested.toFixed(2) : '',
    notes: '',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const openForBuyer = useMemo(() => buyer
    ? invoices.filter((i) => i.open && !i.lost && !i.voided && i.buyer?.id === buyer.id).slice(0, 10)
    : [], [invoices, buyer])
  const existing = openForBuyer.find((i) => String(i.id) === String(f.existing_invoice_id))

  const submit = async (e) => {
    e.preventDefault()
    if (!buyer) { setErr('These units are sold to different buyers — invoice one buyer at a time.'); return }
    if (blocked) { setErr(`${blocked} unit${blocked === 1 ? ' is' : 's are'} still waiting on documents — resolve them above first.`); return }
    setBusy(true); setErr('')
    try {
      const r = await invoiceUnits({
        invoiceId: existing?.id ?? null,
        invoice: existing ? null : {
          invoice_number: nextInvoiceNumber(invoices),
          buyer_party_id: buyer.id,
          invoice_date: f.invoice_date || today,
          due_date: f.due_date || null,
          terms: f.terms || null,
          amount: f.amount === '' ? null : Number(f.amount),
          notes: f.notes || null,
          open: true,
        },
        unitIds: units.map((u) => u.id),
        // Adjustments ride along as their own visible lines. A hand-edited
        // total shows up as one more line so the lines always add up.
        lines: breakdownsToLines(rows, existing || f.amount === '' ? null : Number(f.amount)),
      })
      onSaved({ invoiceNumber: existing?.invoice_number ?? r.invoice_number, buyerName: buyer.name, count: units.length })
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  const n = units.length
  return (
    <Modal title={n === 1 ? `Invoice ${units[0].unit_number || `W${units[0].legacy_bwt_id ?? units[0].id}`}` : `Invoice ${n} units`} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="est-list">
          {rows.map(({ u, b, est }) => (
            <div key={u.id} className="est-row">
              <span className="ticket">W{u.legacy_bwt_id ?? u.id}</span>
              <b>{u.unit_number || '—'}</b>
              <span className="muted">{u.equipment_type?.name || '—'}</span>
              <span className="muted">{unitLocation(u) || ''}</span>
              <Pill status={u.status?.name} />
              <span className="amt muted">
                {(u.confirmed_net ?? u.net_wt) != null ? `${Number(u.confirmed_net ?? u.net_wt).toLocaleString()} lb` : 'no weight'}
                {est != null && <> · <b style={{ color: 'var(--ink)' }}>{money(est)}</b></>}
              </span>
              {b && b.skipped.length > 0 && <div className="adj-line muted" style={{ flexBasis: '100%' }}>Not applied — no tire count: {[...new Set(b.skipped)].join(', ')}</div>}
              {b && b.adjustments.map((a, i) => (
                <div key={i} className="adj-line" style={{ flexBasis: '100%' }}>
                  <span>{a.direction === 'add' ? '+' : '−'} {a.description}{a.category ? <span className="muted"> · {categoryLabel(a.category)}</span> : null}{a.detail ? <span className="muted"> · {a.detail}</span> : null}</span>
                  <span className="mono" style={{ color: a.amount < 0 ? 'var(--error)' : 'var(--ink)' }}>{a.amount < 0 ? '−' : '+'}{money(Math.abs(a.amount))}</span>
                </div>
              ))}
              <DocGateRow unit={u} gate={docGate(u)} onChange={(fields) => setDocs(u, fields)} />
            </div>
          ))}
          {suggested != null && n > 1 && (
            <div className="est-row" style={{ background: 'var(--panel)' }}>
              <span className="muted">Sale and adjustments, as separate lines on the invoice{blocked ? ` · ${blocked} unit${blocked === 1 ? '' : 's'} waiting on documents` : ''}</span>
              <span className="amt"><b>{money(suggested)}</b></span>
            </div>
          )}
        </div>

        {!buyer ? (
          <div className="banner" style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
            {buyerIds.length > 1 ? <>These units are sold to <b>{buyerIds.length} different buyers</b>. Invoice one buyer at a time.</> : <>These units have no buyer on record.</>}
          </div>
        ) : (
          <div className="banner">
            <b>{buyer.name}</b>
            <span className="muted"> · {termsName || 'terms not set'}{buyer.payment_method ? ` · ${buyer.payment_method}` : ''}</span>
            {deductions.length > 0 && <div style={{ fontSize: 12.5, marginTop: 4 }}>Standard deductions: {deductions.map(deductionLabel).join('; ')}</div>}
          </div>
        )}

        {openForBuyer.length > 0 && (
          <div className="field">
            <label>Add to</label>
            <select value={f.existing_invoice_id} onChange={set('existing_invoice_id')}>
              <option value="">New invoice ({nextInvoiceNumber(invoices)})</option>
              {openForBuyer.map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_number} · {i.invoice_date || 'undated'} · {i.amount != null ? money(i.amount) : 'no amount'} · {i.units?.[0]?.count ?? 0} unit{(i.units?.[0]?.count ?? 0) === 1 ? '' : 's'}</option>
              ))}
            </select>
            <div className="fieldnote">{buyer.name} has {openForBuyer.length} open invoice{openForBuyer.length === 1 ? '' : 's'} — add to one if this is the same billing.</div>
          </div>
        )}

        {existing ? (
          <div className="banner">Adding {n} unit{n === 1 ? '' : 's'} to <b>{existing.invoice_number}</b>{suggested != null ? <>. Its lines are added and its total goes up by <b>{money(suggested)}</b>.</> : <>. These units have no price or weight yet, so no lines are added; adjust the amount on the Invoices tab.</>}</div>
        ) : (
          <div className="form-grid">
            <div className="field">
              <label>Invoice date</label>
              <input type="date" value={f.invoice_date} onChange={(e) => setF({ ...f, invoice_date: e.target.value, due_date: dueDate({ invoice_date: e.target.value, terms: f.terms }, termsName) || f.due_date })} />
            </div>
            <div className="field">
              <label>Terms</label>
              <input value={f.terms} onChange={set('terms')} placeholder="Net 30 Days" />
            </div>
            <div className="field">
              <label>Due date</label>
              <input type="date" value={f.due_date} onChange={set('due_date')} />
              <div className="fieldnote">From invoice date + terms; change if the deal says otherwise.</div>
            </div>
            <div className="field">
              <label>Amount ($)</label>
              <input type="number" step="0.01" min="0" value={f.amount} onChange={set('amount')} />
              <div className="fieldnote">Computed from weights, SO price and adjustments. Edit it and the difference is kept as its own line.</div>
            </div>
            <div className="field full">
              <label>Notes</label>
              <textarea value={f.notes} onChange={set('notes')} />
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy || !buyer || blocked > 0} title={blocked ? 'Resolve the documents above first' : undefined}>
            {busy ? 'Saving…' : existing ? `Add ${n} to ${existing.invoice_number}` : `Invoice ${n} unit${n === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
