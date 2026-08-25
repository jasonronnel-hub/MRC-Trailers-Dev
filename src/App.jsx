import { useCallback, useEffect, useState } from 'react'
import { supabase, signOut } from './lib/supabase'
import { fetchAll, fetchMyRole, fetchStatusCounts } from './lib/api'
import { SignIn, MfaVerify, MfaEnroll, NoRole } from './components/Login'
import Logo from './components/Logo'
import PipelineRail from './components/PipelineRail'
import Inventory from './components/Inventory'
import Buyers from './components/Buyers'
import Orders from './components/Orders'
import Dispatch from './components/Dispatch'
import Invoices from './components/Invoices'
import TuesdayReport from './components/TuesdayReport'
import Assistant from './components/Assistant'

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
  const [counts, setCounts] = useState({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('inventory')
  const [statusFilter, setStatusFilter] = useState(null)

  const refresh = useCallback(
    () => Promise.all([fetchAll(), fetchStatusCounts()])
      .then(([d, c]) => { setData(d); setCounts(c); setRefreshKey((k) => k + 1) })
      .catch((e) => setErr(e.message)),
    [],
  )
  useEffect(() => { refresh() }, [refresh])

  if (err) return <div className="auth-wrap"><div className="auth-err">Couldn’t load data: {err}</div></div>
  if (!data) return <div className="auth-wrap"><span className="muted">Loading…</span></div>

  const { statuses, parties, orders } = data
  const buyerCount = parties.filter((p) => p.group?.name === 'Trailer Buyer').length
  const totalUnits = Object.values(counts).reduce((a, b) => a + b, 0)
  const screenProps = { data, counts, role, refresh, refreshKey }

  return (
    <>
      <div className="topbar">
        <div className="brand"><Logo /></div>
        <PipelineRail statuses={statuses} counts={counts}
          statusFilter={statusFilter}
          setStatusFilter={(s) => { setTab('inventory'); setStatusFilter(s) }} />
        <div className="userchip">
          <span className="email">{email}</span>
          <span className="role">{role}</span>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </div>

      <div className="body">
        <div className="nav">
          {[
            ['inventory', 'Inventory', totalUnits],
            ['buyers', 'Buyers', buyerCount],
            ['orders', 'Sales Orders', orders.length],
            ['dispatch', 'Dispatch', data.dispatches.length || null],
            ['invoices', 'Invoices', data.invoices.filter((i) => i.open).length || null],
            ['tuesday', 'Tuesday Report', null],
            ['assistant', 'Assistant', null],
          ].map(([k, label, n]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              <span className="txt">{label}</span>
              {n != null && <span className="navtag">{n}</span>}
            </button>
          ))}
        </div>

        <div className="main">
          {tab === 'inventory' && (
            <Inventory key={refreshKey} {...screenProps} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
          )}
          {tab === 'buyers' && <Buyers {...screenProps} />}
          {tab === 'orders' && <Orders {...screenProps} />}
          {tab === 'dispatch' && <Dispatch {...screenProps} />}
          {tab === 'invoices' && <Invoices {...screenProps} />}
          {tab === 'tuesday' && <TuesdayReport {...screenProps} />}
          {tab === 'assistant' && <Assistant {...screenProps} />}
        </div>
      </div>
    </>
  )
}
