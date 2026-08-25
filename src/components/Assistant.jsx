import { useEffect, useRef, useState } from 'react'
import { callAssistant } from '../lib/assistant'
import { buildSnapshot, applyActions } from '../lib/assistantActions'
import { can } from '../lib/api'

const EXAMPLES = [
  'Which buyers have no destruction agreement on file?',
  'Create an AUG 26 sales order for SA Recycling, item 7010, 17 cents per lb, ref weight 8500.',
  'Attach the two Ready FedEx drop frame pups to SA Recycling’s AUG 26 order.',
  'Mark the Hub Group container as dispatched.',
  'How many units are Ready — Sales Required right now?',
]

export default function Assistant({ data, counts, role, refresh }) {
  const [log, setLog] = useState([{
    role: 'bot',
    text: "Hey — I'm your ops assistant. Ask me to create a buyer, build a sales order, attach units, move units through the pipeline, or answer a question about what's in the system. Forms are always there as a fallback if I mishear you.",
  }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log, busy])

  const send = async (text) => {
    const t = (text ?? input).trim()
    if (!t || busy) return
    setInput('')
    const next = [...log, { role: 'user', text: t }]
    setLog(next)
    setBusy(true)
    try {
      const snapshot = buildSnapshot(data, counts)
      const { reply, actions } = await callAssistant(t, snapshot)
      let did = []
      if (actions?.length) {
        did = await applyActions(data, actions, role)
        if (did.length) await refresh()
      }
      setLog([...next, { role: 'bot', text: reply || 'Done.', did }])
    } catch (e) {
      setLog([...next, { role: 'bot', text: `Something went wrong reaching the assistant (${e.message}). The forms still work without it.` }])
    }
    setBusy(false)
  }

  const readonly = role === 'readonly'

  return (
    <div>
      <div className="pagehead"><h2>Assistant</h2><span className="sub">conversational create / attach / query</span></div>
      <div className="asst" style={{ height: 'calc(100vh - 200px)' }}>
        <div className="chatlog">
          {log.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>
              <div className="who">{m.role === 'user' ? 'You' : 'AI'}</div>
              <div className="bubble">
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                {m.did?.length > 0 && (
                  <div className="did"><b>Done</b><ul>{m.did.map((d, j) => <li key={j}>{d}</li>)}</ul></div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="msg bot"><div className="who">AI</div><div className="bubble muted">working…</div></div>}
          <div ref={endRef} />
        </div>
        <div className="composer">
          {readonly && <div className="fieldnote" style={{ marginBottom: 8 }}>Your role is read-only — I can answer questions but can't make changes.</div>}
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={can(role, 'createOrder') ? 'e.g. Create an AUG 26 order for SA Recycling at 17¢/lb, then attach the two Ready FedEx pups…' : 'Ask a question about buyers, units, or sales orders…'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }} />
          <div className="row">
            <button className="btn" disabled={busy || !input.trim()} onClick={() => send()}>Send</button>
            <span className="hint">⌘/Ctrl + Enter</span>
          </div>
          <div className="prompts">
            {EXAMPLES.map((p, i) => (
              <button key={i} disabled={busy} onClick={() => send(p)}>{p.length > 58 ? `${p.slice(0, 58)}…` : p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
