import { useState } from 'react'
import Modal from './Modal'

// Draft-only email handoff (Spec §1: generate .eml/mailto drafts first;
// direct sending comes later). Kim reviews and edits everything here, then
// hands off to the mail app — nothing sends from this screen.
export default function EmailModal({ draft, title, close }) {
  const [to, setTo] = useState(draft.to || '')
  const [subject, setSubject] = useState(draft.subject || '')
  const [body, setBody] = useState(draft.body || '')

  const openMailApp = () => {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const downloadEml = () => {
    // When the draft carries an HTML version (e.g. Kim's formatted covering
    // letter), the .eml is HTML so red/bold survive; mailto stays plain.
    const eml = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'X-Unsent: 1',
      draft.html ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      '',
      draft.html || body,
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([eml], { type: 'message/rfc822' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${subject.slice(0, 60).replace(/[^\w\- ]+/g, '')}.eml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal title={title} close={close}>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Draft only — review and edit, then open it in your mail app to send.
        {draft.html && <> The <b>.eml download</b> carries the formatted version (red/bold + tables); the text below is the plain fallback.</>}
      </p>
      <div className="field">
        <label>To</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
      </div>
      <div className="field">
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label>Body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)}
          style={{ minHeight: 260, fontFamily: '"JetBrains Mono", monospace', fontSize: 12.5 }} />
      </div>
      <div className="form-actions">
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn ghost" onClick={downloadEml}>Download .eml</button>
        <button className="btn" onClick={openMailApp}>Open in mail app</button>
      </div>
    </Modal>
  )
}
