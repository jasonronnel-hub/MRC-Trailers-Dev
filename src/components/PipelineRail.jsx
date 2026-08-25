import { statusMeta, toneColor } from '../lib/statuses'

export default function PipelineRail({ statuses, units, statusFilter, setStatusFilter }) {
  const counts = {}
  for (const s of statuses) counts[s.name] = 0
  for (const u of units) if (u.status) counts[u.status.name] = (counts[u.status.name] || 0) + 1

  return (
    <div className="rail">
      {statuses
        .filter((s) => s.name !== 'State Unknown' || counts[s.name] > 0)
        .map((s) => {
          const m = statusMeta(s.name)
          return (
            <div
              key={s.id}
              className={'rail-stage' + (statusFilter === s.name ? ' active' : '')}
              onClick={() => setStatusFilter(statusFilter === s.name ? null : s.name)}
              title={s.name}
            >
              <div className="cnt">{counts[s.name] ?? 0}</div>
              <div className="lbl">{m.short}</div>
              <div className="bar" style={{ background: toneColor(m.tone) }} />
            </div>
          )
        })}
    </div>
  )
}
