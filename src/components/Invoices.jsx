import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import Pill from './Pill'
import {
  can, saveInvoice, nextInvoiceNumber, fetchInvoiceUnits,
  assignUnitsToInvoice, markInvoicePaid, fetchUnitsPage, suggestedUnitAmount,
  flagInvoiceDispute, resolveInvoiceDispute, markInvoiceLost, unmarkInvoiceLost,
} from '../lib/api'
import { isOverdue, daysPastDue, dueDate, AR_RULES } from '../lib/ar'
import { useNotes, PopupBanners, NotesList } from './Notes'
import SearchSelect from './SearchSelect'
import WeightsModal from './WeightsModal'

const money = (n) => n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

// Phase 3b strawman — invoiced ≠ paid. Payment state lives HERE, on the
// invoice, never as a unit status. Katherine edits everything on this screen.
export default function Invoices({ data, role, refresh }) {
  const { invoices, parties, statuses } = data
  const [q, setQ] = useState('')
  const [view, setView] = useState('open')            // open | paid | all
  const [drawerInv, setDrawerInv] = useState(null)
  const [formInv, setFormInv] = useState(null)        // null | 'new' | invoice
  const [attachInv, setAttachInv] = useState(null)
  const [payInv, setPayInv] = useState(null)
  const [disputeInv, setDisputeInv] = useState(null)
  const [lostInv, setLostInv] = useState(null)

  const writable = can(role, 'editInvoice')
  // Standard-model buyers get their schedule auto-applied to suggestions;
  // 'variable' buyers negotiate per deal, so nothing is assumed.
  const buyerDeductions = (inv) => {
    const buyer = parties.find((p) => p.id === inv.buyer?.id)
    return buyer?.deduction_model === 'standard' ? (buyer.deductions || []) : []
  }
  const saved = () => { setFormInv(null); setAttachInv(null); setPayInv(null); setDisputeInv(null); setLostInv(null); setDrawerInv(null); refresh() }
  const disputedCount = invoices.filter((i) => i.disputed).length
  // Overdue = open, not disputed, not lost, past due date (+ grace). Due
  // date comes from the invoice, else invoice date + terms (invoice's own
  // terms text, else the buyer's). Rules in lib/ar.js — provisional.
  const termsOf = (inv) => parties.find((p) => p.id === inv.buyer?.id)?.payment_terms?.name
  const overdueCount = invoices.filter((i) => isOverdue(i, termsOf(i))).length
  const lostCount = invoices.filter((i) => i.lost).length

  let rows = invoices
  if (view === 'open') rows = rows.filter((i) => i.open && !i.lost)
  if (view === 'overdue') rows = rows.filter((i) => isOverdue(i, termsOf(i))).sort((a, b) => (daysPastDue(b, termsOf(b)) ?? 0) - (daysPastDue(a, termsOf(a)) ?? 0))
  if (view === 'lost') rows = rows.filter((i) => i.lost)
  if (view === 'disputed') rows = rows.filter((i) => i.disputed)
  if (view === 'paid') rows = rows.filter((i) => !i.open)
  if (q.trim()) {
    const needle = q.trim().toLowerCase()
    rows = rows.filter((i) =>
      [i.invoice_number, i.buyer?.name, i.payment_ref]
        .some((v) => v && v.toLowerCase().includes(needle)))
  }

  return (
    <div>
      <div className="pagehead">
        <h2>Invoices</h2>
        <span className="sub">strawman for Katherine — open = money not received</span>
        {can(role, 'createInvoice') && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setFormInv('new')}>+ New invoice</button>
        )}
      </div>

      <div className="filters">
        <input className="search" placeholder="Search invoice #, buyer, payment ref…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        {[['open', 'Open'], ['overdue', `Overdue${overdueCount ? ` (${overdueCount})` : ''}`], ['disputed', `Disputed${disputedCount ? ` (${disputedCount})` : ''}`], ['paid', 'Paid'], ['lost', `Lost${lostCount ? ` (${lostCount})` : ''}`], ['all', 'All']].map(([k, label]) => (
          <span key={k} className={'chip' + (view === k ? ' on' : '')} onClick={() => setView(k)}>{label}</span>
        ))}
        <span className="muted" style={{ fontSize: 12.5 }}>{rows.length.toLocaleString()} shown</span>
      </div>
      {data.invoicesPaidTruncated && (view === 'paid' || view === 'all') && (
        <div className="banner" style={{ marginBottom: 10 }}>
          Showing every open and disputed invoice plus the <b>most recent 1,000 paid</b>. Older paid history isn’t loaded yet — server-side search is on the list.
        </div>
      )}

      {rows.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th><th>Buyer</th><th>Date</th><th>Amount</th>
                <th>Units</th><th>Status</th><th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} onClick={() => setDrawerInv(i)}>
                  <td className="mono"><b>{i.invoice_number}</b>{i.legacy_invoice_id && <span className="tag" style={{ marginLeft: 6 }}>ROM</span>}</td>
                  <td>{i.buyer?.name || '—'}</td>
                  <td className="mono muted">{i.invoice_date || '—'}</td>
                  <td>{money(i.amount)}</td>
                  <td>{i.units?.[0]?.count ?? 0}</td>
                  <td>
                    {i.lost
                      ? <span className="pill"><span className="dot" />Lost</span>
                      : i.disputed
                      ? <span className="pill error"><span className="dot" />Disputed</span>
                      : i.open
                        ? <span className="pill copper"><span className="dot" />Open</span>
                        : <span className="pill"><span className="dot" />Paid</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {i.open ? (() => {
                        const due = dueDate(i, termsOf(i)); const late = daysPastDue(i, termsOf(i))
                        return due ? <>due {due}{!i.lost && late > AR_RULES.overdueGraceDays && <span style={{ color: 'var(--error)', marginLeft: 6 }}>{late}d late</span>}</> : '—'
                      })()
                      : `${money(i.paid_amount ?? i.amount)}${i.paid_date ? ` on ${i.paid_date}` : ''}${i.payment_method ? ` · ${i.payment_method}` : ''}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">No invoices match. {writable && view === 'open' && <>Create one and attach <b>Delivered — Invoice Required</b> units.</>}</div>
      )}

      {drawerInv && (
        <InvoiceDrawer invoice={drawerInv} writable={writable} role={role}
          deductions={buyerDeductions(drawerInv)}
          close={() => setDrawerInv(null)}
          onEdit={() => setFormInv(drawerInv)}
          onAttach={() => setAttachInv(drawerInv)}
          onPay={() => setPayInv(drawerInv)}
          onDispute={() => setDisputeInv(drawerInv)}
          onLost={can(role, 'markInvoiceLost') ? () => setLostInv(drawerInv) : null}
          onUnlost={can(role, 'markInvoiceLost') ? async () => { await unmarkInvoiceLost(drawerInv.id); saved() } : null}
          buyerTerms={termsOf(drawerInv)}
          onResolve={async () => { await resolveInvoiceDispute(drawerInv.id); saved() }} />
      )}
      {formInv && (
        <InvoiceForm invoice={formInv === 'new' ? null : formInv} invoices={invoices}
          parties={parties} close={() => setFormInv(null)} onSaved={saved} />
      )}
      {attachInv && (
        <AttachToInvoiceModal invoice={attachInv} statuses={statuses}
          deductions={buyerDeductions(attachInv)}
          close={() => setAttachInv(null)} onSaved={saved} />
      )}
      {payInv && <MarkPaidModal invoice={payInv} close={() => setPayInv(null)} onSaved={saved} />}
      {disputeInv && <DisputeModal invoice={disputeInv} close={() => setDisputeInv(null)} onSaved={saved} />}
      {lostInv && <LostModal invoice={lostInv} close={() => setLostInv(null)} onSaved={saved} />}
    </div>
  )
}

function InvoiceDrawer({ invoice: i, writable, role, deductions = [], buyerTerms, close, onEdit, onAttach, onPay, onDispute, onResolve, onLost, onUnlost }) {
  const late = i.open && !i.lost ? daysPastDue(i, buyerTerms) : null
  const [units, setUnits] = useState(null)
  const [weightsUnit, setWeightsUnit] = useState(null)
  const notesState = useNotes('invoice', i.id)
  const loadUnits = () => fetchInvoiceUnits(i.id).then(setUnits).catch(() => setUnits([]))
  useEffect(() => { loadUnits() }, [i.id])   // eslint-disable-line react-hooks/exhaustive-deps

  const suggested = (units || []).reduce((s, u) => s + (suggestedUnitAmount(u, deductions) ?? 0), 0)

  const exportCsv = () => {
    const header = 'unit_number,vin,type,net_wt,confirmed_net,so,price,price_unit,suggested_amount'
    const lines = (units || []).map((u) => [
      u.unit_number ?? '', u.vin ?? '', u.equipment_type?.name ?? '',
      u.net_wt ?? '', u.confirmed_net ?? '',
      u.sales_order?.order_number ?? '', u.sales_order?.price ?? '', u.sales_order?.price_unit ?? '',
      suggestedUnitAmount(u, deductions)?.toFixed(2) ?? '',
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
    const url = URL.createObjectURL(new Blob([[header, ...lines].join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${i.invoice_number}-units.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="drawer-wrap" onClick={close}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="dhead">
          <div>
            <h3 className="mono">{i.invoice_number}</h3>
            <div className="kind">Invoice · {i.lost ? 'LOST — written off, kept for history' : i.disputed ? 'DISPUTED' : i.open ? 'OPEN — money not received' : 'paid'}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {writable && i.open && <button className="btn sm" onClick={onPay}>Mark paid</button>}
            {writable && !i.disputed && i.open && <button className="btn ghost sm" onClick={onDispute}>Flag dispute…</button>}
            {writable && i.disputed && <button className="btn ghost sm" onClick={onResolve}>Resolve dispute</button>}
            {writable && i.open && <button className="btn ghost sm" onClick={onAttach}>Attach units</button>}
            {onLost && i.open && !i.lost && <button className="btn ghost sm" onClick={onLost}>Mark lost…</button>}
            {onUnlost && i.lost && <button className="btn ghost sm" onClick={onUnlost}>Undo lost</button>}
            {writable && <button className="btn ghost sm" onClick={onEdit}>Edit</button>}
            <button className="x" onClick={close} aria-label="Close" style={{ marginLeft: 0 }}>×</button>
          </div>
        </div>
        <div className="dbody">
          {i.disputed && (
            <div className="banner" style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
              <b>⚑ Disputed{i.disputed_at ? ` since ${i.disputed_at.slice(0, 10)}` : ''}:</b>{' '}
              {i.dispute_reason || 'no reason recorded'}
              {i.dispute_amount != null && <> — shortfall {money(i.dispute_amount)}</>}
              <div style={{ fontSize: 12, marginTop: 4 }}>TJ works the collection; log progress in the notes below.</div>
            </div>
          )}
          {i.lost && (
            <div className="banner">
              <b>Written off as lost{i.lost_at ? ` on ${i.lost_at.slice(0, 10)}` : ''}.</b> {i.lost_reason || 'No reason recorded.'} The record stays for history; it is out of the AR chase.
            </div>
          )}
          {late > AR_RULES.overdueGraceDays && !i.disputed && (
            <div className="banner" style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
              <b>{late} days past due</b> (due {dueDate(i, buyerTerms)}).
            </div>
          )}
          <PopupBanners popups={notesState.popups} />
          <dl className="kv">
            <dt>Buyer</dt><dd>{i.buyer?.name || '—'}</dd>
            <dt>Invoice date</dt><dd className="mono">{i.invoice_date || '—'}</dd>
            <dt>Due</dt><dd className="mono">{i.due_date || (dueDate(i, buyerTerms) ? <>{dueDate(i, buyerTerms)} <span className="muted">(from terms)</span></> : '—')}</dd>
            <dt>Terms</dt><dd>{i.terms || '—'}</dd>
            <dt>Amount</dt>
            <dd>
              {money(i.amount)}
              {i.open && suggested > 0 && <span className="muted"> · suggested from units: {money(suggested)}</span>}
            </dd>
            {!i.open && (<>
              <dt>Paid</dt>
              <dd>{money(i.paid_amount ?? i.amount)}{i.paid_date ? ` on ${i.paid_date}` : ''}{i.payment_method ? ` · ${i.payment_method}` : ''}{i.payment_ref ? ` · ref ${i.payment_ref}` : ''}</dd>
            </>)}
          </dl>
          {i.notes && <div className="banner"><b>Notes:</b> {i.notes}</div>}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn ghost sm" disabled={!units?.length} onClick={exportCsv}>Invoice-ready CSV</button>
          </div>

          <b>Units{units ? ` (${units.length})` : ''}</b>
          {units === null ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Loading…</div>
          ) : units.length ? (
            <div className="tablewrap" style={{ marginTop: 8 }}>
              <table>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.id} style={{ cursor: 'default' }}>
                      <td><span className="ticket">W{u.legacy_bwt_id ?? u.id}</span></td>
                      <td>{u.unit_number || '—'}</td>
                      <td className="muted">{u.confirmed_net ?? u.net_wt ?? '—'}{(u.confirmed_net ?? u.net_wt) != null ? ' lb' : ''}</td>
                      <td><Pill status={u.status?.name} /></td>
                      <td>
                        {writable && (
                          <button className="btn ghost sm" onClick={() => setWeightsUnit(u)}>Weights</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>None attached yet.</div>
          )}

          <NotesList entityType="invoice" entityId={i.id} notesState={notesState} role={role} />
        </div>
      </div>
      {weightsUnit && (
        <WeightsModal unit={weightsUnit}
          close={() => setWeightsUnit(null)}
          onSaved={() => { setWeightsUnit(null); loadUnits() }} />
      )}
    </div>
  )
}

// Lost is a deliberate accounting decision (never automatic). The invoice
// stays open in the record so history is intact; it leaves the AR chase.
function LostModal({ invoice, close, onSaved }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try { await markInvoiceLost(invoice.id, reason); onSaved() } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <Modal title={`Write off ${invoice.invoice_number} as lost`} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{invoice.buyer?.name} · {money(invoice.amount)}. This keeps the record and takes it out of the overdue queue. It can be undone.</p>
      <div className="field"><label>Reason</label><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. buyer out of business, collections exhausted" /></div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn" disabled={busy} onClick={go}>{busy ? 'Saving…' : 'Mark lost'}</button>
      </div>
    </Modal>
  )
}

// Katherine flags the discrepancy; the reason + shortfall become TJ's
// collection brief.
function DisputeModal({ invoice, close, onSaved }) {
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await flagInvoiceDispute(invoice.id, {
        dispute_reason: reason.trim(),
        dispute_amount: amount === '' ? null : Number(amount),
      })
      onSaved()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  return (
    <Modal title={`Flag dispute on ${invoice.invoice_number}`} close={close}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Use this when the buyer’s payment doesn’t match the deductions agreed in
        advance. The invoice shows as <b>Disputed</b> until resolved or paid;
        TJ picks up the collection effort from the Disputed list.
      </p>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label>What’s wrong? *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus
            placeholder="e.g. Took a 2,000 lb wood-floor deduction — this buyer is no-deductions per SO header" />
        </div>
        <div className="field">
          <label>Shortfall amount ($, if known)</label>
          <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy || !reason.trim()}>{busy ? 'Flagging…' : 'Flag dispute'}</button>
        </div>
      </form>
    </Modal>
  )
}

function InvoiceForm({ invoice, invoices, parties, close, onSaved }) {
  const editing = !!invoice
  const buyers = parties.filter((p) => p.group?.name === 'Trailer Buyer')
  const [f, setF] = useState({
    buyer_party_id: invoice?.buyer?.id ?? '',
    invoice_date: invoice?.invoice_date ?? new Date().toISOString().slice(0, 10),
    due_date: invoice?.due_date ?? '',
    terms: invoice?.terms ?? 'Net 30',
    amount: invoice?.amount ?? '',
    notes: invoice?.notes ?? '',
    open: invoice?.open ?? true,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const fields = {
        buyer_party_id: f.buyer_party_id || null,
        invoice_date: f.invoice_date || null,
        due_date: f.due_date || null,
        terms: f.terms || null,
        amount: f.amount === '' ? null : Number(f.amount),
        notes: f.notes || null,
        open: f.open,
      }
      if (!editing) fields.invoice_number = nextInvoiceNumber(invoices)
      await saveInvoice(fields, invoice?.id)
      onSaved()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  return (
    <Modal title={editing ? `Edit ${invoice.invoice_number}` : 'New invoice'} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label>Buyer *</label>
            <SearchSelect autoFocus placeholder="Type to find a buyer…" style={{ width: '100%' }}
              options={buyers.map((b) => ({ id: b.id, label: b.name }))}
              value={f.buyer_party_id}
              onChange={(v) => setF({ ...f, buyer_party_id: v })} />
          </div>
          <div className="field">
            <label>Invoice date</label>
            <input type="date" value={f.invoice_date} onChange={set('invoice_date')} />
          </div>
          <div className="field">
            <label>Due date</label>
            <input type="date" value={f.due_date} onChange={set('due_date')} />
          </div>
          <div className="field">
            <label>Terms</label>
            <input value={f.terms} onChange={set('terms')} placeholder="Net 30" />
          </div>
          <div className="field">
            <label>Amount ($)</label>
            <input type="number" step="any" min="0" value={f.amount} onChange={set('amount')} />
            <div className="fieldnote">A suggestion from attached units appears in the drawer.</div>
          </div>
          <div className="field full">
            <label>Notes</label>
            <textarea value={f.notes} onChange={set('notes')} />
          </div>
          {editing && (
            <div className="field">
              <label className="checkline"><input type="checkbox" checked={f.open} onChange={set('open')} /> Open (unpaid)</label>
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy || !f.buyer_party_id}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create invoice'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Attach Delivered — Invoice Required units. Server-backed, explicit checks.
function AttachToInvoiceModal({ invoice, statuses, deductions = [], close, onSaved }) {
  const [q, setQ] = useState('')
  const [deliveredOnly, setDeliveredOnly] = useState(true)
  const [candidates, setCandidates] = useState(null)
  const [selected, setSelected] = useState(new Map())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const deliveredId = statuses.find((s) => s.name === 'Delivered — Invoice Required')?.id
  const closedId = statuses.find((s) => s.name === 'Invoiced — Closed')?.id
  const buyerId = invoice.buyer?.id

  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const { rows } = await fetchUnitsPage({
          filters: {
            unattachedInvoice: true,
            buyerId: buyerId || null,
            q,
            ...(deliveredOnly
              ? { statusIds: deliveredId ? [deliveredId] : [] }
              : { notStatusIds: closedId ? [closedId] : [] }),
          },
          pageSize: 200,
        })
        setCandidates(rows)
      } catch (e) { setErr(e.message) }
    }, 250)
    return () => clearTimeout(timer.current)
  }, [q, deliveredOnly, deliveredId, closedId, buyerId])

  const toggle = (u) => {
    const next = new Map(selected)
    next.has(u.id) ? next.delete(u.id) : next.set(u.id, u)
    setSelected(next)
  }

  const suggested = [...selected.values()].reduce((s, u) => s + (suggestedUnitAmount(u, deductions) ?? 0), 0)

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      await assignUnitsToInvoice(invoice.id, [...selected.keys()])
      onSaved()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  return (
    <Modal title={`Attach units to ${invoice.invoice_number}`} close={close}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Buyer: <b>{invoice.buyer?.name || '—'}</b> (only this buyer’s units are listed).
        Attached units flip to <b>Invoiced — Closed</b>; payment is tracked on the invoice, not the unit.
      </p>
      {err && <div className="auth-err">{err}</div>}
      <div className="filters" style={{ marginBottom: 10 }}>
        <input className="search" placeholder="Search unit #, VIN…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="checkline" style={{ padding: 0 }}>
          <input type="checkbox" checked={deliveredOnly} onChange={(e) => setDeliveredOnly(e.target.checked)} />
          Delivered — Invoice Required only
        </label>
      </div>
      {selected.size > 0 && (
        <div className="banner" style={{ marginBottom: 8 }}>
          <b>{selected.size} selected</b>{suggested > 0 && <> — suggested total {money(suggested)}</>}
        </div>
      )}
      {candidates === null ? (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      ) : candidates.length ? (
        <div className="attach-list">
          {candidates.map((u) => (
            <label key={u.id} className="attach-row">
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u)} />
              <span className="ticket">W{u.legacy_bwt_id ?? u.id}</span>
              <b>{u.unit_number || '—'}</b>
              <span className="muted">{u.confirmed_net ?? u.net_wt ?? '—'} lb</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>{money(suggestedUnitAmount(u, deductions))}</span>
              <Pill status={u.status?.name} />
            </label>
          ))}
        </div>
      ) : (
        <div className="empty" style={{ padding: 24 }}>No uninvoiced units match.</div>
      )}
      <div className="form-actions">
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn" disabled={busy || selected.size === 0} onClick={submit}>
          {busy ? 'Attaching…' : `Attach ${selected.size} unit${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  )
}

function MarkPaidModal({ invoice, close, onSaved }) {
  const [f, setF] = useState({
    paid_date: new Date().toISOString().slice(0, 10),
    paid_amount: invoice.amount ?? '',
    payment_method: 'ACH',
    payment_ref: '',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await markInvoicePaid(invoice.id, {
        ...f,
        paid_amount: f.paid_amount === '' ? null : Number(f.paid_amount),
        payment_ref: f.payment_ref || null,
      })
      onSaved()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  return (
    <Modal title={`Mark ${invoice.invoice_number} paid`} close={close}>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Payment received</label>
            <input type="date" value={f.paid_date} onChange={set('paid_date')} required autoFocus />
          </div>
          <div className="field">
            <label>Amount received ($)</label>
            <input type="number" step="any" min="0" value={f.paid_amount} onChange={set('paid_amount')} />
          </div>
          <div className="field">
            <label>Method</label>
            <select value={f.payment_method} onChange={set('payment_method')}>
              {['ACH', 'Wire', 'Check', 'Cash'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Reference (check # / wire ref)</label>
            <input value={f.payment_ref} onChange={set('payment_ref')} />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Partial payments: leave the invoice open and note the amount — proper
          partial application is a Phase 3b decision with Katherine.
        </p>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Mark paid'}</button>
        </div>
      </form>
    </Modal>
  )
}
