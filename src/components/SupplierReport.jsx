import { useEffect, useMemo, useState } from 'react'
import Logo from './Logo'
import EmailModal from './EmailModal'
import SearchSelect from './SearchSelect'
import { fetchUnitsPage } from '../lib/api'
import { supplierReportCover } from '../lib/emailTemplates'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Supplier inventory / removal report — REBUILT FROM KIM'S REAL ARTIFACT
// (ROM "Inventory Report", fxg_inventory report_6.30.26.xls): a per-supplier
// accountability report of purchased units at the supplier's own locations.
// Four sections, her column set, 30-day removal history. Section mapping
// from our pipeline is a first pass for Kim to correct.
const fmt = (d) => d || ''

export default function SupplierReport({ data }) {
  const { parties, statuses } = data
  const suppliers = useMemo(() => parties.filter((p) => p.group?.name === 'Trailer Supplier'), [parties])
  const [supplierId, setSupplierId] = useState('')
  const [units, setUnits] = useState(null)
  const [removed, setRemoved] = useState(null)
  const [copied, setCopied] = useState(false)
  const [emailDraft, setEmailDraft] = useState(null)

  useEffect(() => {
    if (!supplierId && suppliers.length) {
      setSupplierId(String((suppliers.find((s) => /fedex/i.test(s.name)) ?? suppliers[0]).id))
    }
  }, [suppliers, supplierId])

  const closedId = statuses.find((s) => s.name === 'Invoiced — Closed')?.id
  const cutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  }, [])

  useEffect(() => {
    if (!supplierId) return
    setUnits(null); setRemoved(null)
    const load = async () => {
      const active = []
      for (let page = 0; ; page++) {
        const { rows } = await fetchUnitsPage({
          filters: { sourceId: supplierId, notStatusIds: closedId ? [closedId] : [] },
          page, pageSize: 1000,
        })
        active.push(...rows)
        if (rows.length < 1000) break
      }
      const { rows: rem } = await fetchUnitsPage({
        filters: { sourceId: supplierId, pickedUpSince: cutoff },
        pageSize: 1000,
      })
      setUnits(active); setRemoved(rem)
    }
    load().catch(() => { setUnits([]); setRemoved([]) })
  }, [supplierId, closedId, cutoff])

  const sections = useMemo(() => {
    if (!units) return null
    const by = (pred) => units.filter(pred).sort((a, b) =>
      (a.purchase_location || a.physical_location || '').localeCompare(b.purchase_location || b.physical_location || ''))
    const removedIds = new Set((removed || []).map((u) => u.id))
    return {
      notReady: by((u) => u.status?.name === 'Purchased Not Ready' && !removedIds.has(u.id)),
      readyAwait: by((u) => ['Ready — Sales Required', 'Sold — Dispatch Required'].includes(u.status?.name) && !removedIds.has(u.id)),
      dispatchedPending: by((u) => u.status?.name === 'Dispatched — Delivery Required' && !u.pickup_date),
      confirmedRemovals: (removed || []).slice().sort((a, b) => (a.pickup_date || '').localeCompare(b.pickup_date || '')),
    }
  }, [units, removed])

  const supplier = suppliers.find((s) => String(s.id) === String(supplierId))
  const supplierName = supplier?.name || ''
  const unitLabel = (u) => `${u.unit_number || `W${u.legacy_bwt_id ?? u.id}`}${u.missing ? ' - MIA?' : ''}`
  const loc = (u) => u.purchase_location || u.physical_location || '—'

  const SECTION_TITLES = [
    ['notReady', 'Purchased - Not Ready'],
    ['readyAwait', 'Ready – Dispatch Required'],
    ['dispatchedPending', 'Dispatched – Removal Pending/Confirmation Required'],
    ['confirmedRemovals', 'Confirmed Removals - 30 Days History'],
  ]

  const asText = () => {
    const L = [`INVENTORY REPORT — ${supplierName} — ${new Date().toLocaleDateString()}`, '']
    for (const [key, title] of SECTION_TITLES) {
      const list = sections[key]
      L.push(`${title} (${list.length})`)
      for (const u of list) {
        L.push(`  ${unitLabel(u).padEnd(16)} ${loc(u).padEnd(34)} ready:${fmt(u.ready_date) || 'NO'}  removed:${fmt(u.pickup_date) || '—'}`)
      }
      L.push('')
    }
    return L.join('\n')
  }

  const copy = async () => {
    await navigator.clipboard.writeText(asText())
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const exportCsv = () => {
    const header = 'section,unit_number,mia,buy_date,unit_location,ready_date,ready,removal_date'
    const lines = SECTION_TITLES.flatMap(([key, title]) =>
      sections[key].map((u) => [
        title, u.unit_number || `W${u.legacy_bwt_id ?? u.id}`, u.missing ? 'MIA' : '',
        '', loc(u), u.ready_date || '', u.ready_date ? 'YES' : 'NO', u.pickup_date || '',
      ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')))
    const url = URL.createObjectURL(new Blob([[header, ...lines].join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${supplierName.replaceAll(/\W+/g, '_')}_inventory_report_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="filters no-print">
        <SearchSelect placeholder="Type to find the supplier…" style={{ minWidth: 200 }}
          options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
          value={supplierId} onChange={setSupplierId} />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost sm" onClick={copy} disabled={!sections}>{copied ? 'Copied ✓' : 'Copy as text'}</button>
          <button className="btn ghost sm" onClick={exportCsv} disabled={!sections}>CSV</button>
          <button className="btn ghost sm" onClick={() => window.print()} disabled={!sections}>Print</button>
          <button className="btn sm" disabled={!sections}
            onClick={() => {
              const cover = supplierReportCover()
              const tables = SECTION_TITLES.map(([key, title]) => `
<h3 style="font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px">${esc(title)} (${sections[key].length})</h3>
${sections[key].length ? `<table cellpadding="4" cellspacing="0" border="1" style="border-collapse:collapse;font-size:12px">
<tr><th>Unit Number</th><th>Unit Location</th><th>Ready Date</th><th>Ready</th><th>Removal Date</th></tr>
${sections[key].map((u) => `<tr><td>${esc(unitLabel(u))}</td><td>${esc(loc(u))}</td><td>${esc(u.ready_date || '')}</td><td>${u.ready_date ? 'YES' : 'NO'}</td><td>${esc(u.pickup_date || '')}</td></tr>`).join('\n')}
</table>` : '<p style="color:#888">None.</p>'}`).join('\n')
              setEmailDraft({
                // the stored distribution list: FedEx managers + MRC folks
                to: (supplier?.report_recipients || '').split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean).join(', '),
                subject: `${supplierName} Inventory Report — ${new Date().toLocaleDateString()}`,
                body: `${cover.text}\n\n${'='.repeat(60)}\n\n${asText()}`,
                html: `${cover.html}\n<hr>\n<h2 style="font-size:16px">INVENTORY REPORT — ${esc(supplierName)} — ${new Date().toLocaleDateString()}</h2>\n${tables}`,
              })
            }}>
            Email report…
          </button>
        </span>
      </div>

      {!sections ? (
        <div className="empty">Loading {supplierName || 'supplier'} units…</div>
      ) : (
        <div className="print-area" style={{ maxWidth: 860 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <Logo height={38} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700 }}>INVENTORY REPORT</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{supplierName} · {new Date().toLocaleDateString()}</div>
            </div>
          </div>

          {SECTION_TITLES.map(([key, title]) => (
            <div key={key} style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, borderBottom: '1px solid var(--line)', paddingBottom: 4 }}>
                {title} ({sections[key].length})
              </h3>
              {sections[key].length ? (
                <table style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr><th>Unit Number</th><th>Unit Location</th><th>Ready Date</th><th>Ready</th><th>Removal Date</th></tr>
                  </thead>
                  <tbody>
                    {sections[key].map((u) => (
                      <tr key={u.id} style={{ cursor: 'default' }}>
                        <td>
                          <b>{u.unit_number || `W${u.legacy_bwt_id ?? u.id}`}</b>
                          {u.missing && <span className="tag" style={{ marginLeft: 6, color: 'var(--error)', borderColor: 'var(--error)' }}>MIA?</span>}
                        </td>
                        <td>{loc(u)}</td>
                        <td className="mono">{fmt(u.ready_date) || '—'}</td>
                        <td>{u.ready_date ? 'YES' : 'NO'}</td>
                        <td className="mono">{fmt(u.pickup_date) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>None.</div>
              )}
            </div>
          ))}
          <p className="muted no-print" style={{ fontSize: 12 }}>
            Section mapping from the internal pipeline is a first pass — Kim corrects. Buy-date
            column omitted pending her call on what "Buy Transaction" should show. The recipient
            list lives on the supplier’s record (Buyers → {supplierName || 'supplier'} → Edit →
            Report recipients).
          </p>
        </div>
      )}
      {emailDraft && (
        <EmailModal draft={emailDraft} title={`Inventory report → ${supplierName} managers + MRC`}
          close={() => setEmailDraft(null)} />
      )}
    </div>
  )
}
