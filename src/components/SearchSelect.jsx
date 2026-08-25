import { useEffect, useId, useMemo, useState } from 'react'

// Type-ahead replacement for <select> where the option list is long (real
// migrated data has hundreds of sources/buyers). Native input+datalist:
// no dependencies, keyboard-friendly, degrades to plain typing.
//
// options: [{ id, label }]. Selecting an exact label calls onChange(id);
// clearing the field calls onChange(''). Duplicate labels get a "(#id)"
// suffix so every choice stays unambiguous.
export default function SearchSelect({ options, value, onChange, placeholder = '', style, autoFocus }) {
  const listId = useId()

  const { entries, byLabel, byId } = useMemo(() => {
    const counts = {}
    for (const o of options) counts[o.label] = (counts[o.label] || 0) + 1
    const entries = options.map((o) => ({
      id: o.id,
      label: counts[o.label] > 1 ? `${o.label} (#${o.id})` : o.label,
    }))
    return {
      entries,
      byLabel: new Map(entries.map((e) => [e.label, e.id])),
      byId: new Map(entries.map((e) => [String(e.id), e.label])),
    }
  }, [options])

  const selectedLabel = value ? (byId.get(String(value)) ?? '') : ''
  const [text, setText] = useState(selectedLabel)
  useEffect(() => { setText(selectedLabel) }, [selectedLabel])

  const handle = (e) => {
    const v = e.target.value
    setText(v)
    if (v === '') { onChange(''); return }
    const id = byLabel.get(v)
    if (id != null) onChange(id)
  }

  // On blur, snap back to the current selection if the text isn't a match —
  // half-typed text never silently changes the filter.
  const blur = () => { if (!byLabel.has(text)) setText(selectedLabel) }

  return (
    <>
      <input className="search" list={listId} value={text} onChange={handle} onBlur={blur}
        placeholder={placeholder} style={style} autoFocus={autoFocus} />
      <datalist id={listId}>
        {entries.map((e) => <option key={e.id} value={e.label} />)}
      </datalist>
    </>
  )
}
