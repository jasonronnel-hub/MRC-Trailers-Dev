import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchNotes, addNote, voidNote, can } from '../lib/api'

// Notes machinery shared by the unit and buyer drawers. ROM parity:
// popup notes are must-see warnings shown the moment a record opens
// (PopUpNote); the rest are the running history Kim/TJ/Katherine live in.

export function useNotes(entityType, entityId) {
  const [notes, setNotes] = useState(null)   // null = loading
  const [err, setErr] = useState('')

  const reload = useCallback(() => {
    if (entityId == null) { setNotes(null); return }   // e.g. an inline drawer that isn't open
    fetchNotes(entityType, entityId).then(setNotes).catch((e) => setErr(e.message))
  }, [entityType, entityId])
  useEffect(() => { reload() }, [reload])

  return {
    err,
    loading: notes === null,
    popups: (notes || []).filter((n) => n.popup),
    regular: (notes || []).filter((n) => !n.popup),
    reload,
  }
}

export function PopupBanners({ popups }) {
  return popups.map((n) => (
    <div key={n.id} className="banner"
      style={{ background: 'var(--error-tint)', borderColor: 'rgba(179,64,47,0.35)', borderLeftColor: 'var(--error)' }}>
      <b>⚑ {n.note_type || 'Warning'}:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{n.note_text}</span>
    </div>
  ))
}

// One consolidated Notes section per record (Jason, Sept 2026). `pinned` are
// the standing free-text fields ROM kept on the record itself (dealer notes,
// Kim's trucking notes, contact notes…) — shown first, labelled by source,
// then the dated history. Type chips narrow a long list (haulers carry
// hundreds of ROM "Import Notes").
export function NotesList({ entityType, entityId, notesState, role, pinned = [] }) {
  const { loading, regular, reload, err } = notesState
  const [typeFilter, setTypeFilter] = useState(null)
  const types = useMemo(() => {
    const c = {}
    for (const n of regular) { const k = n.note_type || 'Untyped'; c[k] = (c[k] || 0) + 1 }
    return Object.entries(c).sort((a, b) => b[1] - a[1])
  }, [regular])
  const shown = typeFilter ? regular.filter((n) => (n.note_type || 'Untyped') === typeFilter) : regular
  const pins = pinned.filter((p) => p.text && String(p.text).trim())
  const [text, setText] = useState('')
  const [popup, setPopup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [addErr, setAddErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setAddErr('')
    try {
      await addNote(entityType, entityId, text.trim(), popup)
      setText(''); setPopup(false)
      reload()
    } catch (ex) { setAddErr(ex.message) }
    setBusy(false)
  }

  const doVoid = async (id) => {
    try { await voidNote(id); reload() } catch (ex) { setAddErr(ex.message) }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <b>Notes{loading ? '' : ` (${regular.length + pins.length})`}</b>
      {(err || addErr) && <div className="auth-err" style={{ marginTop: 6 }}>{err || addErr}</div>}

      {can(role, 'addNote') && (
        <form onSubmit={submit} style={{ margin: '8px 0 10px' }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Add a note…"
            style={{ width: '100%', minHeight: 44, border: '1px solid var(--line)', borderRadius: 6, padding: 8, fontSize: 13 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <label className="checkline" style={{ padding: 0, fontSize: 12.5 }}>
              <input type="checkbox" checked={popup} onChange={(e) => setPopup(e.target.checked)} />
              Pop-up warning (must-see)
            </label>
            <button className="btn sm" style={{ marginLeft: 'auto' }} disabled={busy || !text.trim()}>
              {busy ? 'Saving…' : 'Add note'}
            </button>
          </div>
        </form>
      )}

      {pins.map((p, i) => (
        <div key={`pin-${i}`} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', margin: '6px 0', fontSize: 13 }}>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 3 }}><span className="tag">{p.label}</span></div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>
        </div>
      ))}

      {!loading && types.length > 1 && (
        <div className="filters" style={{ margin: '8px 0 4px', gap: 4 }}>
          <span className={'chip' + (!typeFilter ? ' on' : '')} onClick={() => setTypeFilter(null)}>All {regular.length}</span>
          {types.map(([t, n]) => (
            <span key={t} className={'chip' + (typeFilter === t ? ' on' : '')} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>{t} {n}</span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      ) : shown.length ? (
        shown.map((n) => (
          <div key={n.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0', fontSize: 13 }}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{n.note_text}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 3, display: 'flex', gap: 8 }}>
              {n.note_type && <span className="tag">{n.note_type}</span>}
              <span>{n.authored_at ? new Date(n.authored_at).toLocaleDateString() : ''}</span>
              {n.legacy_note_id && <span className="tag">ROM</span>}
              {can(role, 'addNote') && !n.legacy_note_id && (
                <button style={{ background: 'none', border: 0, color: 'var(--ink-soft)', textDecoration: 'underline', fontSize: 11.5, padding: 0, marginLeft: 'auto' }}
                  onClick={() => doVoid(n.id)}>void</button>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{pins.length ? 'No dated notes.' : 'No notes yet.'}</div>
      )}
    </div>
  )
}
