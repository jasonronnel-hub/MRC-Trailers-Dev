import { useEffect, useMemo, useRef, useState } from 'react'
import Pill from './Pill'
import UnitDrawer from './UnitDrawer'
import UnitForm from './UnitForm'
import WeightsModal from './WeightsModal'
import ImportModal from './ImportModal'
import SellModal from './SellModal'
import DispatchForm from './DispatchForm'
import InvoiceModal from './InvoiceModal'
import SearchSelect from './SearchSelect'
import { can, fetchUnitsPage, unitLocation, markUnitsReady, markUnitsDelivered } from '../lib/api'
import { COLUMNS, loadColumns, saveColumns, resetColumns } from '../lib/columns'
import { ATTENTION, cutoffs, attentionReasons, needsBackfill } from '../lib/attention'
import { isOverdue } from '../lib/ar'

const PAGE_SIZE = 50

// App remounts this screen when data refreshes (key={refreshKey}), which
// wiped the "Sold 2 units…" banner before anyone read it. Park the message
// here across the remount.
let pendingNotice = ''

// After a sale, jump to the Sold view so the units are seen landing where
// they went (Jason, Sept 2026). Set to 'stay' to keep the pre-Sept behaviour
// of remaining on the Ready list — one word to revert.
const AFTER_SALE_VIEW = 'sold'

// Quick views — the anti-overwhelm layer. "Active" (the default) hides the
// years of Invoiced — Closed history; it's the working pipeline only.
const VIEWS = [
  { key: 'active', label: 'Active pipeline' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]

const dash = <span className="muted">—</span>
const dateCell = (v) => (v ? <span className="mono muted">{v}</span> : dash)

export default function Inventory({ data, counts, role, refresh, statusFilter, setStatusFilter }) {
  const { statuses, parties, equipTypes, titleTypes, invoices = [] } = data
  const [view, setView] = useState('active')
  const [sourceId, setSourceId] = useState('')
  const [buyerId, setBuyerId] = useState('')
  const [equipTypeId, setEquipTypeId] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [sort, setSort] = useState({ col: null, dir: 'asc' })
  const [page, setPage] = useState(0)
  const [result, setResult] = useState({ rows: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [drawerUnit, setDrawerUnit] = useState(null)
  const [formUnit, setFormUnit] = useState(null)
  const [weightsUnit, setWeightsUnit] = useState(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState(() => { const n = pendingNotice; pendingNotice = ''; return n })
  const [selected, setSelected] = useState(new Map())   // id -> unit; survives paging/search
  const [selling, setSelling] = useState(null)          // array of units for the Sell modal
  const [dispatching, setDispatching] = useState(null)  // array of units for the Dispatch form
  const [invoicing, setInvoicing] = useState(null)      // array of units for the Invoice modal
  const [acting, setActing] = useState(false)
  const [reload, setReload] = useState(0)               // bump to refetch the current page
  const [colMenu, setColMenu] = useState(false)

  // debounce the search box so we don't query per keystroke
  const qTimer = useRef(null)
  useEffect(() => {
    clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => { setDebouncedQ(q); setPage(0) }, 300)
    return () => clearTimeout(qTimer.current)
  }, [q])

  const suppliers = useMemo(() => parties.filter((p) => p.group?.name === 'Trailer Supplier'), [parties])
  const buyers = useMemo(() => parties.filter((p) => p.group?.name === 'Trailer Buyer'), [parties])
  const sid = (name) => statuses.find((s) => s.name === name)?.id
  const closedId = sid('Invoiced — Closed')
  const unknownId = sid('State Unknown')
  const statusName = statusFilter ? statuses.find((s) => s.id === statusFilter)?.name : null

  // ---- columns: a default set per status view, adjustable and remembered ----
  const viewKey = statusName || view
  const [cols, setCols] = useState(() => loadColumns(viewKey))
  useEffect(() => { setCols(loadColumns(viewKey)); setColMenu(false) }, [viewKey])
  const toggleCol = (key) => {
    const next = cols.includes(key) ? cols.filter((k) => k !== key) : [...cols, key]
    setCols(next); saveColumns(viewKey, next)
  }

  const filters = useMemo(() => {
    const f = { sourceId: sourceId || null, buyerId: buyerId || null, equipTypeId: equipTypeId || null, q: debouncedQ }
    if (statusFilter) {
      f.statusIds = [statusFilter]           // rail click / status dropdown overrides the view
    } else if (view === 'active') {
      f.notStatusIds = closedId ? [closedId] : []
    } else if (view === 'closed') {
      f.statusIds = closedId ? [closedId] : []
    } else if (view === 'attention') {
      f.attention = true
    }
    return f
  }, [statusFilter, view, sourceId, buyerId, equipTypeId, debouncedQ, closedId])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr('')
    const run = async () => {
      try {
        if (filters.attention) {
          // Needs Attention: a multi-status, date-driven queue. Each condition
          // is its own cheap query; thresholds live in lib/attention.js.
          const base = { ...filters, attention: undefined }
          const c = cutoffs()
          const pick = (extra, pageSize = 500) => fetchUnitsPage({ filters: { ...base, ...extra }, sort, page: 0, pageSize })
          const [mia, unknown, stale, unsold, dispatched, imported] = await Promise.all([
            pick({ missingOnly: true }),
            unknownId ? pick({ statusIds: [unknownId] }) : { rows: [] },
            pick({ statusIds: [sid('Purchased Not Ready')], purchasedBefore: c.notReadyBefore }),
            pick({ statusIds: [sid('Ready — Sales Required')], readyBefore: c.readyBefore }),
            pick({ statusIds: [sid('Dispatched — Delivery Required')] }, 1000),
            pick({ importedOnly: true }, 1000),
          ])
          const seen = new Set()
          const rows = [
            ...mia.rows, ...unknown.rows, ...stale.rows, ...unsold.rows,
            ...dispatched.rows.filter((u) => u.dispatch?.delivery_eta && u.dispatch.delivery_eta <= c.etaBefore),
            ...imported.rows.filter((u) => needsBackfill(u).length),
          ].filter((u) => !seen.has(u.id) && seen.add(u.id))
          if (!cancelled) setResult({ rows, count: rows.length })
        } else {
          const r = await fetchUnitsPage({ filters, sort, page, pageSize: PAGE_SIZE })
          if (!cancelled) setResult(r)
        }
      } catch (e) { if (!cancelled) setErr(e.message) }
      if (!cancelled) setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [filters, sort, page, unknownId, reload])   // eslint-disable-line react-hooks/exhaustive-deps

  const overdueInvoices = useMemo(() => {
    const termsOf = (inv) => parties.find((p) => p.id === inv.buyer?.id)?.payment_terms?.name
    return invoices.filter((i) => isOverdue(i, termsOf(i))).length
  }, [invoices, parties])

  const saved = () => { setFormUnit(null); setDrawerUnit(null); refresh(); setReload((n) => n + 1) }
  // ---- stage-aware selection: the checkbox does the NEXT thing at every stage ----
  // Not Ready → Mark ready (or Sell); Ready → Sell; Sold → Dispatch;
  // Dispatched → Mark delivered; Delivered → Invoice. One column, one bar.
  const st = (u) => u.status?.name
  const notReady = (u) => st(u) === 'Purchased Not Ready' && !u.voided
  const sellable = (u) => !u.sales_order && st(u) !== 'Invoiced — Closed' && !u.voided
  const dispatchable = (u) => st(u) === 'Sold — Dispatch Required' && !u.dispatch && !u.voided
  const deliverable = (u) => st(u) === 'Dispatched — Delivery Required' && !u.voided
  const invoiceable = (u) => st(u) === 'Delivered — Invoice Required' && !u.invoice && !u.voided
  const canReady = can(role, 'editUnit')
  const canSell = can(role, 'createOrder')
  const canDispatch = can(role, 'createDispatch')
  const canDeliver = can(role, 'editDispatch')
  const canInvoice = can(role, 'createInvoice')
  const selectable = (u) => (canReady && notReady(u)) || (canSell && sellable(u)) || (canDispatch && dispatchable(u))
    || (canDeliver && deliverable(u)) || (canInvoice && invoiceable(u))
  const anySelectable = canReady || canSell || canDispatch || canDeliver || canInvoice
  const hint = (u) => notReady(u) ? 'Select to mark ready or sell' : sellable(u) ? 'Select to sell' : dispatchable(u) ? 'Select to dispatch'
    : deliverable(u) ? 'Select to mark delivered' : invoiceable(u) ? 'Select to invoice' : 'Nothing to do from here'
  const toggle = (u) => setSelected((m) => { const n = new Map(m); n.has(u.id) ? n.delete(u.id) : n.set(u.id, u); return n })
  const sel = [...selected.values()]
  const all = (pred) => sel.length > 0 && sel.every(pred)
  const allNotReady = all(notReady), allSellable = all(sellable), allDispatchable = all(dispatchable)
  const allDeliverable = all(deliverable), allInvoiceable = all(invoiceable)
  const anyAction = (canReady && allNotReady) || (canSell && allSellable) || (canDispatch && allDispatchable) || (canDeliver && allDeliverable) || (canInvoice && allInvoiceable)

  const done = (msg, nextStatus) => {
    pendingNotice = msg
    setSelected(new Map()); setDrawerUnit(null); refresh(); setReload((n) => n + 1); setNotice(msg)
    if (nextStatus) { setView('active'); setStatusFilter(sid(nextStatus)); setPage(0) }
  }
  const markReady = async (units) => {
    setActing(true); setErr('')
    try {
      await markUnitsReady(units.map((u) => u.id), sid('Ready — Sales Required'))
      done(`Marked ${units.length} unit${units.length === 1 ? '' : 's'} ready — now Ready — Sales Required.`, 'Ready — Sales Required')
    } catch (e) { setErr(e.message) }
    setActing(false)
  }
  const markDelivered = async (units) => {
    setActing(true); setErr('')
    try {
      await markUnitsDelivered(units.map((u) => u.id), sid('Delivered — Invoice Required'))
      done(`Marked ${units.length} unit${units.length === 1 ? '' : 's'} delivered — now Delivered — Invoice Required.`, 'Delivered — Invoice Required')
    } catch (e) { setErr(e.message) }
    setActing(false)
  }
  const dispatched = ({ dispatchNumber, haulerName, count }) => {
    setDispatching(null)
    done(`Dispatched ${count} unit${count === 1 ? '' : 's'} on ${dispatchNumber}${haulerName ? ` with ${haulerName}` : ''} — now Dispatched — Delivery Required.`, 'Dispatched — Delivery Required')
  }
  const invoiced = ({ invoiceNumber, buyerName, count }) => {
    setInvoicing(null)
    done(`Invoiced ${count} unit${count === 1 ? '' : 's'} to ${buyerName} on ${invoiceNumber} — now Invoiced — Closed.`, 'Invoiced — Closed')
  }
  const sold = ({ orderNumber, buyerName, count }) => {
    setSelling(null)
    done(`Sold ${count} unit${count === 1 ? '' : 's'} to ${buyerName} on ${orderNumber} — now Sold — Dispatch Required.`,
      AFTER_SALE_VIEW === 'sold' ? 'Sold — Dispatch Required' : null)
  }
  const pages = Math.max(1, Math.ceil(result.count / PAGE_SIZE))

  const sortHeader = (label, col) => (
    <th key={col} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => { setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' })); setPage(0) }}>
      {label}{sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  // ---- cell renderers, one per column key in lib/columns.js ----
  const cell = (key, u) => {
    switch (key) {
      case 'bwt': return <span className="ticket">W{u.legacy_bwt_id ?? u.id}</span>
      case 'unit_number': return (<>
        {u.unit_number || dash}
        {u.missing && <span className="tag" style={{ marginLeft: 6, color: 'var(--error)', borderColor: 'var(--error)' }}>MIA</span>}
      </>)
      case 'vin': return u.vin ? <span className="mono">{u.vin}</span> : dash
      case 'type': return u.equipment_type?.name || dash
      case 'commodity': return u.commodity_code ? <span className="mono">{u.commodity_code}</span> : dash
      case 'make': return u.make?.name || dash
      case 'model_year': return u.model_year || dash
      case 'source': return u.source?.name || dash
      case 'location': return <span className="muted">{unitLocation(u) || '—'}</span>
      case 'status': return <Pill status={u.status?.name} />
      case 'purchase_date': return dateCell(u.purchase_date)
      case 'purchase_price': return u.purchase_price != null ? `$${Number(u.purchase_price).toLocaleString()}` : dash
      case 'ready_date': return dateCell(u.ready_date)
      case 'sold_to': return <span className="muted">{u.sold_to?.name || '—'}</span>
      case 'sales_order': return <span className="mono muted">{u.sales_order?.order_number || '—'}</span>
      case 'sale_date': return dateCell(u.sold_date)
      case 'title': return (<>
        {u.title_type?.name || dash}
        {u.title_received && <span className="tag" style={{ marginLeft: 6 }}>received</span>}
      </>)
      case 'dispatch': return <span className="mono muted">{u.dispatch?.dispatch_number || '—'}</span>
      case 'dispatch_date': return dateCell(u.dispatch_date || u.dispatch?.scheduled_pickup)
      case 'delivery_eta': return dateCell(u.dispatch?.delivery_eta)
      case 'delivered_date': return dateCell(u.completion_date)
      case 'pickup_date': return dateCell(u.pickup_date)
      case 'title_rec_date': return dateCell(u.title_received_date)
      case 'note': return u.replacement_for ? <span className="muted" title={u.replacement_for} style={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{u.replacement_for}</span> : dash
      case 'invoice': return u.invoice ? <span className="mono muted">{u.invoice.invoice_number}{u.invoice.open ? '' : ' · paid'}</span> : dash
      default: return dash
    }
  }

  return (
    <div>
      <div className="pagehead">
        <h2>Inventory</h2>
        <span className="sub">
          {loading ? 'loading…' : `${result.count.toLocaleString()} unit${result.count === 1 ? '' : 's'}`}
          {statusName && <span className="muted"> · {statusName}</span>}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, position: 'relative' }}>
          <button className="btn ghost sm" onClick={() => setColMenu((v) => !v)}>Columns ▾</button>
          {colMenu && (
            <div className="colmenu" onMouseLeave={() => setColMenu(false)}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Columns for <b>{statusName || VIEWS.find((v) => v.key === view)?.label}</b></div>
              {Object.entries(COLUMNS).map(([key, c]) => (
                <label key={key} className="checkline" style={{ padding: '2px 0' }}>
                  <input type="checkbox" checked={cols.includes(key)} onChange={() => toggleCol(key)} /> {c.label}
                </label>
              ))}
              <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setCols(resetColumns(viewKey))}>Reset to default</button>
            </div>
          )}
          {can(role, 'createUnit') && (<>
            <button className="btn ghost sm" onClick={() => setImporting(true)}>Import spreadsheet</button>
            <button className="btn sm" onClick={() => setFormUnit('new')}>+ New unit</button>
          </>)}
        </span>
      </div>

      {notice && <div className="banner" style={{ marginBottom: 12 }}>{notice}</div>}
      {err && <div className="auth-err">{err}</div>}

      <div className="filters">
        {VIEWS.map((v) => (
          <span key={v.key}
            className={'chip' + (view === v.key && !statusFilter ? ' on' : '')}
            onClick={() => { setView(v.key); setStatusFilter(null); setPage(0) }}>
            {v.label}
          </span>
        ))}
        <span style={{ width: 10 }} />
        <select className="search" style={{ minWidth: 150 }} value={statusFilter ?? ''}
          onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : null); setPage(0) }}>
          <option value="">Any status</option>
          {statuses.map((s) => <option key={s.id} value={s.id}>{s.name} ({(counts[s.id] ?? 0).toLocaleString()})</option>)}
        </select>
      </div>
      <div className="filters">
        <input className="search" placeholder="Search unit #, alt #, VIN, location…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <SearchSelect options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
          value={sourceId} onChange={(v) => { setSourceId(v); setPage(0) }}
          placeholder="Any source" style={{ minWidth: 150 }} />
        <SearchSelect options={buyers.map((b) => ({ id: b.id, label: b.name }))}
          value={buyerId} onChange={(v) => { setBuyerId(v); setPage(0) }}
          placeholder="Any buyer" style={{ minWidth: 150 }} />
        <select className="search" style={{ minWidth: 130 }} value={equipTypeId}
          onChange={(e) => { setEquipTypeId(e.target.value); setPage(0) }}>
          <option value="">Any type</option>
          {equipTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {(sourceId || buyerId || equipTypeId || q || statusFilter) && (
          <button className="btn ghost sm" onClick={() => {
            setSourceId(''); setBuyerId(''); setEquipTypeId(''); setQ(''); setStatusFilter(null); setPage(0)
          }}>Clear</button>
        )}
      </div>

      {view === 'attention' && !statusFilter && (
        <div className="banner" style={{ marginBottom: 10 }}>
          <b>Queue rules (provisional):</b> not ready over {ATTENTION.notReadyDays} days · ready but unsold over {ATTENTION.readyUnsoldDays} days · dispatched past its delivery ETA · MIA · state unknown · imported with missing data.
          {overdueInvoices > 0 && <> Also <b>{overdueInvoices} overdue invoice{overdueInvoices === 1 ? '' : 's'}</b> — see the Invoices tab.</>}
        </div>
      )}

      {selected.size > 0 && (
        <div className="selbar">
          <b>{selected.size} selected</b>
          <span className="names">{sel.slice(0, 8).map((u) => u.unit_number || `W${u.legacy_bwt_id ?? u.id}`).join(', ')}{selected.size > 8 ? ', …' : ''}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {canReady && allNotReady && <button className="btn sm" disabled={acting} onClick={() => markReady(sel)}>{acting ? 'Working…' : `Mark ${selected.size} ready`}</button>}
            {canSell && allSellable && <button className={'btn sm' + (allNotReady ? ' ghost' : '')} onClick={() => setSelling(sel)}>Sell {selected.size} unit{selected.size === 1 ? '' : 's'}…</button>}
            {canDispatch && allDispatchable && <button className="btn sm" onClick={() => setDispatching(sel)}>Dispatch {selected.size} unit{selected.size === 1 ? '' : 's'}…</button>}
            {canDeliver && allDeliverable && <button className="btn sm" disabled={acting} onClick={() => markDelivered(sel)}>{acting ? 'Working…' : `Mark ${selected.size} delivered`}</button>}
            {canInvoice && allInvoiceable && <button className="btn sm" onClick={() => setInvoicing(sel)}>Invoice {selected.size} unit{selected.size === 1 ? '' : 's'}…</button>}
            {!anyAction && <span className="muted" style={{ fontSize: 12.5 }}>Mixed selection — pick units at the same stage.</span>}
            <button className="btn ghost sm" onClick={() => setSelected(new Map())}>Clear</button>
          </span>
        </div>
      )}

      {result.rows.length ? (
        <div className="tablewrap" style={{ opacity: loading ? 0.6 : 1 }}>
          <table>
            <thead>
              <tr>
                {anySelectable && <th className="sel"></th>}
                {cols.map((key) => COLUMNS[key].sort ? sortHeader(COLUMNS[key].label, COLUMNS[key].sort) : <th key={key}>{COLUMNS[key].label}</th>)}
                {view === 'attention' && !statusFilter && <th>Why</th>}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((u) => (
                <tr key={u.id} onClick={() => setDrawerUnit(u)}>
                  {anySelectable && (
                    <td className="sel" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" disabled={!selectable(u)} checked={selected.has(u.id)} onChange={() => toggle(u)} title={hint(u)} />
                    </td>
                  )}
                  {cols.map((key) => <td key={key}>{cell(key, u)}</td>)}
                  {view === 'attention' && !statusFilter && (
                    <td>{attentionReasons(u).map((r) => (
                      <span key={r} className="tag" style={{ marginRight: 4, color: 'var(--copper-deep)', borderColor: 'var(--copper)' }}>{r}</span>
                    ))}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{loading ? 'Loading…' : view === 'attention' && !statusFilter ? 'Nothing needs attention right now.' : <>No units match. <b>Clear the filters</b> or switch views.</>}</div>
      )}

      {!filters.attention && result.count > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="muted" style={{ fontSize: 13 }}>
            {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, result.count).toLocaleString()} of {result.count.toLocaleString()} · page {page + 1} of {pages}
          </span>
          <button className="btn ghost sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {drawerUnit && (
        <UnitDrawer unit={drawerUnit} statuses={statuses} role={role} close={() => setDrawerUnit(null)}
          onEdit={can(role, 'editUnit') ? () => setFormUnit(drawerUnit) : null}
          onWeights={can(role, 'editUnit') ? () => setWeightsUnit(drawerUnit) : null}
          onReady={canReady && notReady(drawerUnit) ? () => markReady([drawerUnit]) : null}
          onSell={canSell && sellable(drawerUnit) ? () => setSelling([drawerUnit]) : null}
          onDispatch={canDispatch && dispatchable(drawerUnit) ? () => setDispatching([drawerUnit]) : null}
          onDeliver={canDeliver && deliverable(drawerUnit) ? () => markDelivered([drawerUnit]) : null}
          onInvoice={canInvoice && invoiceable(drawerUnit) ? () => setInvoicing([drawerUnit]) : null} />
      )}
      {invoicing && (
        <InvoiceModal units={invoicing} data={data} close={() => setInvoicing(null)} onSaved={invoiced} />
      )}
      {dispatching && (
        <DispatchForm units={dispatching} dispatches={data.dispatches} parties={parties} close={() => setDispatching(null)} onSaved={dispatched} />
      )}
      {selling && (
        <SellModal units={selling} data={data} refresh={refresh} close={() => setSelling(null)} onSaved={sold} />
      )}
      {weightsUnit && (
        <WeightsModal unit={weightsUnit}
          close={() => setWeightsUnit(null)}
          onSaved={() => { setWeightsUnit(null); setDrawerUnit(null); refresh() }} />
      )}
      {formUnit && (
        <UnitForm unit={formUnit === 'new' ? null : formUnit}
          statuses={statuses} equipTypes={equipTypes} titleTypes={titleTypes} parties={parties}
          commodityCodes={data.commodityCodes} makes={data.makes}
          close={() => setFormUnit(null)} onSaved={saved} />
      )}
      {importing && (
        <ImportModal parties={parties} equipTypes={equipTypes} commodityCodes={data.commodityCodes}
          close={() => setImporting(false)}
          onSaved={({ count, batch, backfill }) => {
            setImporting(false)
            setNotice(`Imported ${count} unit${count === 1 ? '' : 's'} as Purchased Not Ready (batch ${batch}).${backfill ? ` ${backfill} need data filled in — they’re in Needs attention.` : ''}`)
            refresh(); setReload((n) => n + 1)
          }} />
      )}
    </div>
  )
}
