import { useEffect, useMemo, useRef, useState } from 'react'
import Pill from './Pill'
import UnitDrawer from './UnitDrawer'
import UnitForm from './UnitForm'
import ImportModal from './ImportModal'
import SearchSelect from './SearchSelect'
import { statusMeta } from '../lib/statuses'
import { can, fetchUnitsPage } from '../lib/api'

const PAGE_SIZE = 50

// Quick views — the anti-overwhelm layer. "Active" (the default) hides the
// years of Invoiced — Closed history; it's the working pipeline only.
const VIEWS = [
  { key: 'active', label: 'Active pipeline' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]

export default function Inventory({ data, counts, role, refresh, statusFilter, setStatusFilter }) {
  const { statuses, parties, equipTypes, titleTypes } = data
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
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')

  // debounce the search box so we don't query per keystroke
  const qTimer = useRef(null)
  useEffect(() => {
    clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => { setDebouncedQ(q); setPage(0) }, 300)
    return () => clearTimeout(qTimer.current)
  }, [q])

  const suppliers = useMemo(() => parties.filter((p) => p.group?.name === 'Trailer Supplier'), [parties])
  const buyers = useMemo(() => parties.filter((p) => p.group?.name === 'Trailer Buyer'), [parties])
  const closedId = statuses.find((s) => s.name === 'Invoiced — Closed')?.id
  const unknownId = statuses.find((s) => s.name === 'State Unknown')?.id

  const filters = useMemo(() => {
    const f = { sourceId: sourceId || null, buyerId: buyerId || null, equipTypeId: equipTypeId || null, q: debouncedQ }
    if (statusFilter) {
      f.statusIds = [statusFilter]           // rail click / status dropdown overrides the view
    } else if (view === 'active') {
      f.notStatusIds = closedId ? [closedId] : []
    } else if (view === 'closed') {
      f.statusIds = closedId ? [closedId] : []
    } else if (view === 'attention') {
      // MIA units + State Unknown — the "something is wrong" pile
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
          // two cheap queries, merged: MIA + State Unknown
          const [mia, unknown] = await Promise.all([
            fetchUnitsPage({ filters: { ...filters, missingOnly: true, attention: undefined }, sort, page: 0, pageSize: 500 }),
            unknownId ? fetchUnitsPage({ filters: { ...filters, statusIds: [unknownId], attention: undefined }, sort, page: 0, pageSize: 500 }) : { rows: [], count: 0 },
          ])
          const seen = new Set()
          const rows = [...mia.rows, ...unknown.rows].filter((u) => !seen.has(u.id) && seen.add(u.id))
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
  }, [filters, sort, page, unknownId])

  const saved = () => { setFormUnit(null); setDrawerUnit(null); refresh() }
  const pages = Math.max(1, Math.ceil(result.count / PAGE_SIZE))

  const sortHeader = (label, col) => (
    <th style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => { setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' })); setPage(0) }}>
      {label}{sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div>
      <div className="pagehead">
        <h2>Inventory</h2>
        <span className="sub">
          {loading ? 'loading…' : `${result.count.toLocaleString()} unit${result.count === 1 ? '' : 's'}`}
        </span>
        {can(role, 'createUnit') && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn ghost sm" onClick={() => setImporting(true)}>Import bid sheet</button>
            <button className="btn sm" onClick={() => setFormUnit('new')}>+ New unit</button>
          </span>
        )}
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

      {result.rows.length ? (
        <div className="tablewrap" style={{ opacity: loading ? 0.6 : 1 }}>
          <table>
            <thead>
              <tr>
                {sortHeader('BWT', 'id')}
                {sortHeader('Unit #', 'unit_number')}
                <th>Type</th><th>Source</th>
                {sortHeader('Location', 'physical_location')}
                {sortHeader('Status', 'status')}
                <th>Sold to</th><th>SO</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((u) => (
                <tr key={u.id} onClick={() => setDrawerUnit(u)}>
                  <td><span className="ticket">W{u.legacy_bwt_id ?? u.id}</span></td>
                  <td>
                    {u.unit_number || <span className="muted">—</span>}
                    {u.missing && <span className="tag" style={{ marginLeft: 6, color: 'var(--error)', borderColor: 'var(--error)' }}>MIA</span>}
                  </td>
                  <td>{u.equipment_type?.name || <span className="muted">—</span>}</td>
                  <td>{u.source?.name || <span className="muted">—</span>}</td>
                  <td className="muted">{u.physical_location || '—'}</td>
                  <td><Pill status={u.status?.name} /></td>
                  <td className="muted">{u.sold_to?.name || '—'}</td>
                  <td className="mono muted">{u.sales_order?.order_number || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{loading ? 'Loading…' : <>No units match. <b>Clear the filters</b> or switch views.</>}</div>
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
          onEdit={can(role, 'editUnit') ? () => setFormUnit(drawerUnit) : null} />
      )}
      {formUnit && (
        <UnitForm unit={formUnit === 'new' ? null : formUnit}
          statuses={statuses} equipTypes={equipTypes} titleTypes={titleTypes} parties={parties}
          close={() => setFormUnit(null)} onSaved={saved} />
      )}
      {importing && (
        <ImportModal parties={parties} equipTypes={equipTypes}
          close={() => setImporting(false)}
          onSaved={(n) => {
            setImporting(false)
            setNotice(`Imported ${n} unit${n === 1 ? '' : 's'} as Purchased Not Ready — review types and prices, especially 45-ft all-steel units.`)
            refresh()
          }} />
      )}
    </div>
  )
}
