// Server-side bridge to the Anthropic API (Spec §1: "AI assistant feature:
// server-side calls to the Anthropic API — keys kept server-side in Supabase
// Edge Functions, never in the browser").
//
// This function is deliberately "dumb": it takes a message + a data snapshot,
// asks Claude to turn it into {reply, actions}, and returns that JSON as-is.
// It does NOT touch the database and does NOT use a service-role key — all
// writes happen back in the browser through the same RLS-respecting mutation
// functions the forms use, so the assistant can never do more than the signed
// in user's role already allows. Supabase rejects unauthenticated calls to
// this function before it even runs (verify_jwt defaults to true).

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = 'claude-sonnet-5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildSystemPrompt(snapshot) {
  const { buyers = [], orders = [], statusCounts = {}, unitCount = 0, haulers = [], dispatches = [] } = snapshot || {}
  const buyerLines = buyers
    .map((b) => `${b.name} [id ${b.id}, ${b.deduction_model || 'no deduction model set'}${b.destruction_agreement_signed ? '' : ', NO destruction agmt'}]`)
    .join('; ')
  const orderLines = orders
    .map((o) => `${o.order_number} (${o.buyer_name || '?'}, ref ${o.customer_reference || 'none'}, item ${o.item_code || '?'})`)
    .join('; ')
  const countLine = Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ')

  return `You are the assistant inside MRC's Trailers & Containers ops console (a scrap-metal trailer brokerage). You turn plain-English requests into structured data operations, then confirm in a friendly, concise sentence or two. MRC BUYS end-of-life trailers/containers/tractors from fleets (FedEx Ground, Walmart, Union Pacific, Hub Group, JB Hunt) and SELLS them to scrap yards (the "buyers") for destruction.

Reply with ONE JSON object only, no prose outside it:
{"reply":"<short human confirmation or answer>","actions":[ ... ]}

ACTION TYPES (include only what's needed; use [] for pure questions):
- create_buyer: {type,name,billing_address?,payment_terms?,payment_method?,deduction_model?("none"|"standard"|"variable"),standard_deductions?,destruction_agreement_signed?(YYYY-MM-DD),rema_member?(bool),merged_parent?(bool),general_notes?}
- update_buyer: {type,buyer:"<name or id>", ...any buyer fields to change}
- create_order: {type,buyer:"<name or id>",customer_reference?(e.g. "AUG 26"),item_code?(7000-series),price_unit?("per_lb"|"per_nt" net ton 2000lb|"per_gt" gross ton 2240lb|"per_mt" metric tonne|"flat"),price?,ref_weight_lbs?,header_notes?}
- add_units: {type,units:[{unit_number,vin,source(fleet name),equipment_type,physical_location?,pickup_location_code?,pickup_address?,condition_comments?,purchase_price?}]}
- attach_units: {type,buyer?,salesOrder?:"<SO # or ref>",units:{ids?:[],unitNumbers?:[],source?,status?,equipmentType?,physicalLocation?}} // attaching flips units to Sold — Dispatch Required
- set_status: {type,status:<one of the exact status strings>,units:{...same selector...}}
- add_note: {type,note,popup?(bool — must-see warning),buyer?:"<name>"} OR {type,note,popup?,units:{...selector...}}
- create_dispatch: {type,hauler:"<freight company name>",pickup_location?,pickup_address?,destination:"<buying yard name>",destination_address?,scheduled_pickup?(YYYY-MM-DD),delivery_eta?,rate?,rate_basis?("flat"|"per_unit"|"per_mile"),notes?}
- assign_dispatch: {type,dispatch:"<D-#### or blank for the newest open one>",units:{...selector...}} // assigned units flip to Dispatched — Delivery Required and pick up the hauler
- mark_delivered: {type,units:{...selector...}} // flips to Delivered — Invoice Required with today as completion date

EXACT status strings: "Purchased Not Ready", "Ready — Sales Required", "Sold — Dispatch Required", "Dispatched — Delivery Required", "Delivered — Invoice Required", "Invoiced — Closed".

RULES: Match buyers/orders by name loosely. Never invent data the user didn't give — leave optional fields out. If a buyer has NO destruction agreement and the user tries to attach FedEx or Walmart units to them, still build the action but add a warning in "reply". Put buyer confirmation-email text or pricing memos into header_notes/general_notes. For customer_reference use ABBREV MONTH + 2-digit year like "AUG 26".

CURRENT DATA — buyers: ${buyerLines || '(none)'}. Open orders: ${orderLines || '(none)'}. Haulers: ${haulers.map((h) => h.name).join('; ') || '(none)'}. Open dispatches: ${dispatches.map((d) => `${d.dispatch_number} (${d.hauler_name || '?'} → ${d.destination_name || '?'})`).join('; ') || '(none)'}. Unit counts: ${countLine || '(none)'}. Total units: ${unitCount}.
Answer data questions using this snapshot in "reply" with actions:[].`
}

function extractJSON(text) {
  if (!text) return null
  const blocks = text.replace(/```json/gi, '```').split('```').map((s) => s.trim())
  for (const candidate of [...blocks.filter(Boolean), text]) {
    const a = candidate.indexOf('{')
    const b = candidate.lastIndexOf('}')
    if (a >= 0 && b > a) {
      try { return JSON.parse(candidate.slice(a, b + 1)) } catch { /* try next candidate */ }
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const { message, snapshot } = await req.json()
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing "message".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const system = buildSystemPrompt(snapshot)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: message }],
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      return new Response(JSON.stringify({ error: `Anthropic API error (${res.status}): ${detail.slice(0, 400)}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const data = await res.json()
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    const parsed = extractJSON(text)
    if (!parsed) {
      return new Response(JSON.stringify({ reply: 'I couldn’t turn that into a structured action — try rephrasing, or be more specific about the buyer/order/units.', actions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
