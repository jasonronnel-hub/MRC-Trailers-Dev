import { statusMeta, toneColor } from '../lib/statuses'

// Counts come from the unit_status_counts() RPC — always global, never
// dependent on what page/filter the inventory table is showing.
// `kpi` ({ value, label, title }) replaces the Invoiced — Closed count: a
// count of closed units read like a dollar figure. Definition in lib/kpi.js.
export default function PipelineRail({ statuses, counts, statusFilter, setStatusFilter, kpi }) {
  return (
    <div className="rail">
      {statuses
        .filter((s) => s.name !== 'State Unknown' || (counts[s.id] ?? 0) > 0)
        .map((s) => {
          const m = statusMeta(s.name)
          return (
            <div
              key={s.id}
              className={'rail-stage' + (statusFilter === s.id ? ' active' : '')}
              onClick={() => setStatusFilter(statusFilter === s.id ? null : s.id)}
              title={s.name === 'Invoiced — Closed' && kpi ? kpi.title : s.name}
            >
              {s.name === 'Invoiced — Closed' && kpi ? (<>
                <div className="cnt">{kpi.value}</div>
                <div className="lbl">{kpi.label}</div>
              </>) : (<>
                <div className="cnt">{(counts[s.id] ?? 0).toLocaleString()}</div>
                <div className="lbl">{m.short}</div>
              </>)}
              <div className="bar" style={{ background: toneColor(m.tone) }} />
            </div>
          )
        })}
    </div>
  )
}
