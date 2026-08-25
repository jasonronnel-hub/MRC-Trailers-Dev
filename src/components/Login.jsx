import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Logo from './Logo'

function Card({ children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo className="logo" />
        {children}
      </div>
    </div>
  )
}

// Stage 1: email + password.
export function SignIn({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return (
    <Card>
      <h2>Trailers &amp; Containers — sign in</h2>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="auth-note">Accounts are created by the office — there is no self-signup.</div>
    </Card>
  )
}

// Stage 2: TOTP challenge for users who already have MFA enrolled.
export function MfaVerify({ onDone }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { data: factors, error: fe } = await supabase.auth.mfa.listFactors()
    if (fe) { setErr(fe.message); setBusy(false); return }
    const totp = factors.totp?.find((f) => f.status === 'verified')
    if (!totp) { setErr('No authenticator found on this account.'); setBusy(false); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code })
    setBusy(false)
    if (error) { setErr('That code didn’t work — check your authenticator app and try again.'); return }
    onDone()
  }

  return (
    <Card>
      <h2>Two-factor check</h2>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="code">6-digit code from your authenticator app</label>
          <input id="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
        </div>
        <button className="btn" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify'}</button>
      </form>
      <div className="auth-note">
        <button className="linklike" style={{ background: 'none', border: 0, textDecoration: 'underline', color: 'inherit' }}
          onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </Card>
  )
}

// Stage 3: forced TOTP enrollment for admin/accounting (Spec §5.1).
export function MfaEnroll({ role, onDone }) {
  const [factor, setFactor] = useState(null)   // { id, qr, secret }
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const begin = async () => {
    setBusy(true); setErr('')
    // Clear any abandoned unverified enrollments first, or enroll() errors out.
    const { data: existing } = await supabase.auth.mfa.listFactors()
    for (const f of existing?.all ?? []) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MRC Ops Console' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const qr = data.totp.qr_code
    setFactor({
      id: data.id,
      qr: qr.startsWith('data:') ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`,
      secret: data.totp.secret,
    })
  }

  const verify = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    setBusy(false)
    if (error) { setErr('That code didn’t work — scan again or re-enter it.'); return }
    onDone()
  }

  return (
    <Card>
      <h2>Set up two-factor authentication</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        The <b>{role}</b> role requires an authenticator app (Google Authenticator, 1Password, Authy…)
        as a second factor. This is a one-time setup.
      </p>
      {err && <div className="auth-err">{err}</div>}
      {!factor ? (
        <button className="btn" onClick={begin} disabled={busy}>{busy ? 'Preparing…' : 'Begin setup'}</button>
      ) : (
        <form onSubmit={verify}>
          <div className="qr-box"><img src={factor.qr} alt="Scan this QR code with your authenticator app" /></div>
          <div className="secret" title="Manual entry key">{factor.secret}</div>
          <div className="field">
            <label htmlFor="enrollcode">Enter the 6-digit code the app shows</label>
            <input id="enrollcode" inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </div>
          <button className="btn" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Confirm'}</button>
        </form>
      )}
      <div className="auth-note">
        <button style={{ background: 'none', border: 0, textDecoration: 'underline', color: 'inherit' }}
          onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </Card>
  )
}

// Shown to authenticated users with no user_roles row (RLS gives them nothing).
export function NoRole({ email }) {
  return (
    <Card>
      <h2>Account not activated</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        <span className="mono">{email}</span> is signed in but has no role assigned yet.
        Ask Jason or Steve to add you, then sign in again.
      </p>
      <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </Card>
  )
}
