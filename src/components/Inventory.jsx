import { useMemo, useState } from 'react'
import Pill from './Pill'
import { statusMeta } from '../lib/statuses'

export default function Inventory({ statuses, units, statusFilter, setStatusFilter, onOpen }) {
  const [sourceFilter, setSourceFilter] = useState(null)
  const [q, setQ] = useState('')

  const sources = useMemo(
    () => [...new Set(units.map((u) => u.source?.name).filter(Boolean))].sort(),
    [units],
  )

  const rows = useMemo(() => {
    let list = units
    if (statusFilter) list = list.filter((u) => u.status?.name === statusFilter)
    if (sourceFilter) list = list.filter((u) => u.source?.name === sourceFilter)
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter((u) =>
        [u.unit_number, u.alt_unit_number, u.vin, u.physical_location]
          .some((v) => v && v.toLowerCase().includes(needle)))
    }
    return [...list].sort((a, b) =>
      (a.status?.sort_order ?? 99) - (b.status?.sort_order ?? 99) || a.id - b.id)
  }, [units, statusFilter, sourceFilter, q])

  return (
    <div>
      <div className="pagehead">
        <h2>Inventory</h2>
        <span className="sub">{rows.length} of {units.length} broker weight tickets</span>
      </div>

      <div className="filters">
        <input className="search" placeholder="Search unit #, VIN, location…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <span className={'chip' + (!statusFilter ? ' on' : '')} onClick={() => setStatusFilter(null)}>All statuses</span>
        {statuses
          .filter((s) => units.some((u) => u.status?.name === s.name))
          .map((s) => (
            <span key={s.id} className={'chip' + (statusFilter === s.name ? ' on' : '')}
              onClick={() => setStatusFilter(statusFilter === s.name ? null : s.name)}>
              {statusMeta(s.name).short}
            </span>
          ))}
        <span style={{ width: 10 }} />
        <span className={'chip' + (!sourceFilter ? ' on' : '')} onClick={() => setSourceFilter(null)}>All sources</span>
        {sources.map((s) => (
          <span key={s} className={'chip' + (sourceFilter === s ? ' on' : '')}
            onClick={() => setSourceFilter(sourceFilter === s ? null : s)}>{s}</span>
        ))}
      </div>

      {rows.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>BWT</th><th>Unit #</th><th>Type</th><th>Source</th>
                <th>Location</th><th>Status</th><th>Sold to</th><th>SO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} onClick={() => onOpen(u)}>
                  <td><span className="ticket">W{u.legacy_bwt_id ?? u.id}</span></td>
                  <td>{u.unit_number || <span className="muted">—</span>}</td>
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
        <div className="empty">No units match this filter. <b>Clear the filters</b> to see everything.</div>
      )}
    </div>
  )
}
