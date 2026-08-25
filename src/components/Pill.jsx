import { statusMeta } from '../lib/statuses'

export default function Pill({ status }) {
  const m = statusMeta(status)
  return (
    <span className={`pill ${m.tone}`}>
      <span className="dot" />
      {m.short}
    </span>
  )
}
