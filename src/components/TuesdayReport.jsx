import { useEffect, useMemo, useState } from 'react'
import Logo from './Logo'
import { fetchActiveUnits } from '../lib/api'

// Tuesday Report (Phase 3 strawman). Section choice is a first draft of
// "what the division needs to see weekly" — Kim decides the real content.
// Fetches only the ACTIVE pipeline (closed history excluded), so it stays
// fast even with 23k+ migrated units. Renders, prints, copies as text.
export default function TuesdayReport({ data, counts, embedded = true }) {
  const { dispatches, statuses } = data
  const [units, setUnits] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchActiveUnits(statuses).then(setUnits).catch(() => setUnits([]))
  }, [statuses])

  const byStatus = (name) => (units || []).filter((u) => u.status?.name === name)

  const sections = useMemo(() => {
    const ready = byStatus('Ready — Sales Required')
    const sold = byStatus('Sold — Dispatch Required')
    const dispatched = byStatus('Dispatched — Delivery Required')
    const delivered = byStatus('Delivered — Invoice Required')
    const notReady = byStatus('Purchased Not Ready')

    const groupBy = (list, key) => {
      const m = new Map()
      for (const u of list) {
        const k = key(u) || '—'
        if (!m.has(k)) m.set(k, [])
        m.get(k).push(u)
      }
      return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
    }

    return {
      counts: [
        ['Purchased Not Ready', notReady.length],
        ['Ready — Sales Required', ready.length],
        ['Sold — Dispatch Required', sold.length],
        ['Dispatched — Delivery Required', dispatched.length],
        ['Delivered — Invoice Required', delivered.length],
      ],
      readyByLocation: groupBy(ready, (u) => u.physical_location),
      soldByBuyer: groupBy(sold, (u) => u.sold_to?.name),
      dispatched,
      delivered,
    }
  }, [units, dispatches])

  if (units === null) {
    return <div className="empty">Loading active pipeline…</div>
  }

  const unitLabel = (u) => u.unit_number || `W${u.legacy_bwt_id ?? u.id}`

  const asText = () => {
    const L = []
    L.push(`MRC TRAILERS & CONTAINERS — TUESDAY REPORT — ${new Date().toLocaleDateString()}`)
    L.push('')
    L.push('PIPELINE')
    for (const [name, n] of sections.counts) L.push(`  ${String(n).padStart(4)}  ${name}`)
    L.push('')
    L.push(`READY TO SELL (${sections.readyByLocation.reduce((s, [, l]) => s + l.length, 0)})`)
    for (const [loc, list] of sections.readyByLocation)
      L.push(`  ${loc}: ${list.map((u) => `${unitLabel(u)} (${u.equipment_type?.name || '?'})`).join(', ')}`)
    L.push('')
    L.push(`SOLD — AWAITING DISPATCH (${sections.soldByBuyer.reduce((s, [, l]) => s + l.length, 0)})`)
    for (const [buyer, list] of sections.soldByBuyer)
      L.push(`  ${buyer}: ${list.map((u) => `${unitLabel(u)}${u.sales_order?.order_number ? ` [${u.sales_order.order_number}]` : ''}`).join(', ')}`)
    L.push('')
    L.push(`IN TRANSIT (${sections.dispatched.length})`)
    for (const u of sections.dispatched)
      L.push(`  ${unitLabel(u)} → ${u.sold_to?.name || '?'}${u.dispatch?.dispatch_number ? ` (${u.dispatch.dispatch_number})` : ''}`)
    L.push('')
    L.push(`DELIVERED — AWAITING INVOICE (${sections.delivered.length})`)
    for (const u of sections.delivered)
      L.push(`  ${unitLabel(u)} → ${u.sold_to?.name || '?'}${u.sales_order?.order_number ? ` [${u.sales_order.order_number}]` : ''}`)
    return L.join('\n')
  }

  const copy = async () => {
    await navigator.clipboard.writeText(asText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)', paddingBottom: 4 }}>{title}</h3>
      {children}
    </div>
  )

  return (
    <div>
      <div className="filters no-print">
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost sm" onClick={copy}>{copied ? 'Copied ✓' : 'Copy as text'}</button>
          <button className="btn sm" onClick={() => window.print()}>Print</button>
        </span>
      </div>

      <div className="print-area" style={{ maxWidth: 820 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <Logo height={38} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700 }}>TUESDAY REPORT</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <Section title="Pipeline">
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', padding: '6px 0' }}>
            {sections.counts.map(([name, n]) => (
              <div key={name}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{n}</div>
                <div className="muted" style={{ fontSize: 11 }}>{name}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Ready to sell (${sections.readyByLocation.reduce((s, [, l]) => s + l.length, 0)})`}>
          {sections.readyByLocation.map(([loc, list]) => (
            <div key={loc} style={{ fontSize: 13, padding: '3px 0' }}>
              <b>{loc}</b>: {list.map((u) => `${unitLabel(u)} (${u.equipment_type?.name || '?'})`).join(', ')}
            </div>
          ))}
          {!sections.readyByLocation.length && <div className="muted" style={{ fontSize: 13 }}>None.</div>}
        </Section>

        <Section title={`Sold — awaiting dispatch (${sections.soldByBuyer.reduce((s, [, l]) => s + l.length, 0)})`}>
          {sections.soldByBuyer.map(([buyer, list]) => (
            <div key={buyer} style={{ fontSize: 13, padding: '3px 0' }}>
              <b>{buyer}</b>: {list.map((u) => `${unitLabel(u)}${u.sales_order?.order_number ? ` [${u.sales_order.order_number}]` : ''}`).join(', ')}
            </div>
          ))}
          {!sections.soldByBuyer.length && <div className="muted" style={{ fontSize: 13 }}>None.</div>}
        </Section>

        <Section title={`In transit (${sections.dispatched.length})`}>
          {sections.dispatched.map((u) => (
            <div key={u.id} style={{ fontSize: 13, padding: '3px 0' }}>
              {unitLabel(u)} → <b>{u.sold_to?.name || '?'}</b>
              {u.dispatch?.dispatch_number && <span className="mono muted"> ({u.dispatch.dispatch_number})</span>}
            </div>
          ))}
          {!sections.dispatched.length && <div className="muted" style={{ fontSize: 13 }}>None.</div>}
        </Section>

        <Section title={`Delivered — awaiting invoice (${sections.delivered.length})`}>
          {sections.delivered.map((u) => (
            <div key={u.id} style={{ fontSize: 13, padding: '3px 0' }}>
              {unitLabel(u)} → <b>{u.sold_to?.name || '?'}</b>
              {u.sales_order?.order_number && <span className="mono muted"> [{u.sales_order.order_number}]</span>}
            </div>
          ))}
          {!sections.delivered.length && <div className="muted" style={{ fontSize: 13 }}>None.</div>}
        </Section>
      </div>
    </div>
  )
}
