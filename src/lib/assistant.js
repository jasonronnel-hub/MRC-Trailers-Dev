import { supabase } from './supabase'

// Invokes the assistant Edge Function (server-side Anthropic call, Spec §1).
// supabase-js automatically attaches the caller's JWT, so the function only
// ever runs for an authenticated MRC user.
export async function callAssistant(message, snapshot) {
  const { data, error } = await supabase.functions.invoke('assistant', {
    body: { message, snapshot },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data // { reply, actions }
}
