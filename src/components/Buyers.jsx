import { useMemo, useState } from 'react'
import { DEDUCTION_LABELS, can } from '../lib/api'
import PartyDrawer from './PartyDrawer'
import PartyForm from './PartyForm'

export default function Buyers({ data, role, refresh }) {
  const { parties, orders, groups } = data
  const [groupFilter, setGroupFilter] = useState('Trailer Buyer')
  const [drawerParty, setDrawerParty] = useState(null)
  const [formParty, setFormParty] = useState(null)    // null = closed, 'new' = create, object = edit

  const groupNames = useMemo(
    () => [...new Set(parties.map((p) => p.group?.name).filter(Boolean))].sort(),
    [parties],
  )
  const rows = useMemo(
    () => (groupFilter ? parties.filter((p) => p.group?.name === groupFilter) : parties),
    [parties, groupFilter],
  )

  const saved = () => { setFormParty(null); setDrawerParty(null); refresh() }

  return (
    <div>
      <div className="pagehead">
        <h2>Buyers</h2>
        <span className="sub">{rows.length} accounts</span>
        {can(role, 'createParty') && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setFormParty('new')}>+ New account</button>
        )}
      </div>

      <div className="filters">
        <span className={'chip' + (!groupFilter ? ' on' : '')} onClick={() => setGroupFilter(null)}>All groups</span>
        {groupNames.map((g) => (
          <span key={g} className={'chip' + (groupFilter === g ? ' on' : '')}
            onClick={() => setGroupFilter(groupFilter === g ? null : g)}>{g}</span>
        ))}
      </div>

      {rows.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Group</th><th>Deductions</th><th>Terms</th>
                <th>Destruction agmt</th><th>REMA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => setDrawerParty(p)}>
                  <td>
                    <b>{p.name}</b>
                    {p.merged_parent && <span className="tag" style={{ marginLeft: 6 }}>merged</span>}
                    {p.purchase_hot_notes && <span className="tag" style={{ marginLeft: 6, color: 'var(--copper-deep)', borderColor: 'var(--copper)' }}>⚑ note</span>}
                    <div className="muted" style={{ fontSize: 12 }}>{p.billing_address}</div>
                  </td>
                  <td><span className="tag">{p.group?.name || '—'}</span></td>
                  <td>{DEDUCTION_LABELS[p.deduction_model] || <span className="muted">—</span>}</td>
                  <td className="muted">{[p.payment_terms, p.payment_method].filter(Boolean).join(' · ') || '—'}</td>
                  <td>
                    {p.group?.name !== 'Trailer Buyer' ? <span className="muted">n/a</span>
                      : p.destruction_agreement_signed
                        ? <span className="mono" style={{ fontSize: 12.5 }}>{p.destruction_agreement_signed}</span>
                        : <span className="warnrow">none on file</span>}
                  </td>
                  <td>{p.rema_member ? '✓' : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">No accounts in this group.</div>
      )}

      {drawerParty && (
        <PartyDrawer party={drawerParty} orders={orders} role={role} close={() => setDrawerParty(null)}
          onEdit={can(role, 'editParty') ? () => setFormParty(drawerParty) : null} />
      )}
      {formParty && (
        <PartyForm party={formParty === 'new' ? null : formParty} groups={groups}
          close={() => setFormParty(null)} onSaved={saved} />
      )}
    </div>
  )
}
