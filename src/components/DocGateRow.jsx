import { useState } from 'react'
import { DOC_LABELS } from '../lib/docs'

// One unit's document gate, inline where Kat invoices. Blockers get a
// "received" button (the document arrived) or "missing" (it didn't — the unit
// goes to Needs attention). A document the deal doesn't need gets a one-click
// exception that records the reason. Nothing is skipped silently.
export default function DocGateRow({ unit, gate, onChange, compact = false }) {
  const [busy, setBusy] = useState('')
  if (gate.ok && !gate.reviews.length) return null
  const run = async (key, fields) => {
    setBusy(key)
    try { await onChange(fields) } finally { setBusy('') }
  }
  const btn = (key, label, fields, ghost = true) => (
    <button type="button" className={`btn sm${ghost ? ' ghost' : ''}`} disabled={busy === key} onClick={() => run(key, fields)} style={{ padding: '1px 8px', fontSize: 12 }}>{label}</button>
  )
  return (
    <div className="docgate" style={{ flexBasis: '100%', fontSize: 12.5 }}>
      {gate.blockers.map((b) => (
        <div key={b.key} className="docgate-line" style={{ color: 'var(--error)' }}>
          <span>✗ {b.text}</span>
          {onChange && b.key && (
            <span style={{ display: 'flex', gap: 4 }}>
              {btn(b.key + 'r', `${DOC_LABELS[b.key]} received`, { [b.key]: 'received' }, false)}
              {unit[b.key] !== 'missing' && btn(b.key + 'm', 'missing', { [b.key]: 'missing' })}
            </span>
          )}
        </div>
      ))}
      {gate.pending.map((p) => (
        <div key={p.key} className="docgate-line" style={{ color: 'var(--ink-soft)' }}>
          <span>· {p.exception}{p.state === 'missing' ? ' (recorded as missing)' : ''}</span>
          {onChange && (
            <span style={{ display: 'flex', gap: 4 }}>
              {btn(p.key + 'x', 'Record exception', { [p.key]: 'na', [`${p.key}_reason`]: p.exception }, false)}
              {btn(p.key + 'r', 'received', { [p.key]: 'received' })}
            </span>
          )}
        </div>
      ))}
      {!compact && gate.reviews.map((r) => (
        <div key={r.key} className="docgate-line muted">
          <span>– {r.text}</span>
        </div>
      ))}
    </div>
  )
}
