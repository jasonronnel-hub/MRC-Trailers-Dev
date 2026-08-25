import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env')
}

export const supabase = createClient(url, anonKey)

// Always clears the local session, even if the server-side revocation fails
// (e.g. the auth user was deleted while a session was still stored).
export async function signOut() {
  try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* session already gone */ }
}
