// Structured deduction rows — shared by the buyer form (standard schedule),
// the sales order form and the Sell step (per-deal schedule). Each row is
// { id?, description, kind: 'weight'|'dollars', basis: 'per_unit'|'per_tire'|'per_lb', rate }.
// Weight rows reduce billable pounds before pricing; dollar rows subtract
// after. Notes stay free-form for the exceptions.

const F = (v) => v ?? ''
export const newDeduction = () => ({ id: null, description: '', kind: 'weight', basis: 'per_unit', rate: '' })

export function deductionLabel(d) {
  const amt = d.kind === 'weight' ? `${Number(d.rate).toLocaleString()} lb` : `$${Number(d.rate).toLocaleString()}`
  const basis = d.basis === 'per_tire' ? '/tire' : d.basis === 'per_lb' ? '/lb' : '/unit'
  return `${d.description} ${amt}${basis}`
}

export default function DeductionsEditor({ rows, onChange, compact = false }) {
  const set = (i, key, value) => {
    const next = rows.slice()
    next[i] = { ...next[i], [key]: value }
    // a weight deduction per pound is meaningless — snap basis back
    if (key === 'kind' && value === 'weight' && next[i].basis === 'per_lb') next[i].basis = 'per_unit'
    onChange(next)
  }
  const remove = (i) => onChange(rows.filter((_, j) => j !== i))
  return (
    <div>
      {rows.map((d, i) => (
        <div key={d.id ?? `new-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input style={{ flex: 3 }} placeholder="Description (Wood floor, Tires…)" value={F(d.description)} onChange={(e) => set(i, 'description', e.target.value)} />
          <select style={{ flex: 2 }} value={d.kind} onChange={(e) => set(i, 'kind', e.target.value)}>
            <option value="weight">lbs</option>
            <option value="dollars">dollars</option>
          </select>
          <select style={{ flex: 2 }} value={d.basis} onChange={(e) => set(i, 'basis', e.target.value)}>
            <option value="per_unit">per unit</option>
            <option value="per_tire">per tire</option>
            {d.kind === 'dollars' && <option value="per_lb">per lb</option>}
          </select>
          <input style={{ flex: 2 }} type="number" step="any" min="0" placeholder="Rate" value={F(d.rate)} onChange={(e) => set(i, 'rate', e.target.value)} />
          <button type="button" title="Remove" style={{ background: 'none', border: 0, color: 'var(--ink-soft)', fontSize: 14 }} onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => onChange([...rows, newDeduction()])}>
        {compact ? '+ Deduction' : '+ Add deduction'}
      </button>
    </div>
  )
}
