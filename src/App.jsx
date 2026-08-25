import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { fetchInventory, fetchMyRole } from './lib/api'
import { SignIn, MfaVerify, MfaEnroll, NoRole } from './components/Login'
import Logo from './components/Logo'
import PipelineRail from './components/PipelineRail'
import Inventory from './components/Inventory'
import UnitDrawer from './components/UnitDrawer'

const MFA_REQUIRED_ROLES = ['admin', 'accounting'] // Spec §5.1

// Auth stages: loading → signin → verify (existing MFA) → enroll (forced
// MFA setup for admin/accounting) → norole | ready
export default function App() {
  const [stage, setStage] = useState('loading')
  const [role, setRole] = useState(null)
  const [email, setEmail] = useState('')

  const evaluate = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setStage('signin'); return }
    setEmail(session.user.email)

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      setStage('verify'); return
    }

    let myRole = null
    try { myRole = await fetchMyRole() } catch { /* treated as no role */ }
    if (!myRole) { setStage('norole'); return }
    setRole(myRole)

    if (MFA_REQUIRED_ROLES.includes(myRole)) {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const hasVerified = factors?.totp?.some((f) => f.status === 'verified')
      if (!hasVerified) { setStage('enroll'); return }
    }
    setStage('ready')
  }, [])

  useEffect(() => {
    evaluate()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setRole(null); setStage('signin') }
    })
    return () => subscription.unsubscribe()
  }, [evaluate])

  if (stage === 'loading') return <div className="auth-wrap"><span className="muted">Loading…</span></div>
  if (stage === 'signin') return <SignIn onDone={evaluate} />
  if (stage === 'verify') return <MfaVerify onDone={evaluate} />
  if (stage === 'enroll') return <MfaEnroll role={role} onDone={evaluate} />
  if (stage === 'norole') return <NoRole email={email} />
  return <Shell role={role} email={email} />
}

function Shell({ role, email }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('inventory')
  const [statusFilter, setStatusFilter] = useState(null)
  const [drawerUnit, setDrawerUnit] = useState(null)

  useEffect(() => {
    fetchInventory().then(setData).catch((e) => setErr(e.message))
  }, [])

  if (err) return <div className="auth-wrap"><div className="auth-err">Couldn’t load inventory: {err}</div></div>
  if (!data) return <div className="auth-wrap"><span className="muted">Loading inventory…</span></div>

  const { statuses, units } = data

  return (
    <>
      <div className="topbar">
        <div className="brand"><Logo /></div>
        <PipelineRail statuses={statuses} units={units}
          statusFilter={statusFilter}
          setStatusFilter={(s) => { setTab('inventory'); setStatusFilter(s) }} />
        <div className="userchip">
          <span className="email">{email}</span>
          <span className="role">{role}</span>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      <div className="body">
        <div className="nav">
          {[
            ['inventory', 'Inventory', units.length],
            ['buyers', 'Buyers', null],
            ['orders', 'Sales Orders', null],
          ].map(([k, label, n]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              <span className="txt">{label}</span>
              {n != null && <span className="navtag">{n}</span>}
            </button>
          ))}
        </div>

        <div className="main">
          {tab === 'inventory' && (
            <Inventory statuses={statuses} units={units}
              statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              onOpen={setDrawerUnit} />
          )}
          {tab === 'buyers' && <div className="empty">Buyers screen is next on the build plan (Spec §5.3).</div>}
          {tab === 'orders' && <div className="empty">Sales Orders screen is next on the build plan (Spec §5.4).</div>}
        </div>
      </div>

      {drawerUnit && <UnitDrawer unit={drawerUnit} close={() => setDrawerUnit(null)} />}
    </>
  )
}
