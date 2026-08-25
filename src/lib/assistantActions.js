// Turns the assistant's structured actions into calls against the SAME
// mutation functions the forms use (api.js) — so a chat message can never do
// more than the signed-in user's role already allows. RLS is the real
// backstop; `can()` here just gives a friendly denial instead of a raw
// Postgres error.
import {
  can, saveParty, saveOrder, nextOrderNumber, addUnits,
  attachUnits, setUnitsStatus, addNote,
  saveDispatch, nextDispatchNumber, assignUnitsToDispatch, markUnitsDelivered,
} from './api'

// Compact snapshot sent to the edge function — enough for the model to match
// buyers/orders by name and answer count questions, not a full data dump.
export function buildSnapshot(data) {
  const buyers = data.parties
    .filter((p) => p.group?.name === 'Trailer Buyer')
    .map((p) => ({
      id: p.id, name: p.name, deduction_model: p.deduction_model,
      destruction_agreement_signed: p.destruction_agreement_signed,
    }))
  const orders = data.orders
    .filter((o) => o.open)
    .map((o) => ({
      order_number: o.order_number, buyer_name: o.buyer?.name,
      customer_reference: o.customer_reference, item_code: o.item_code,
    }))
  const statusCounts = {}
  for (const s of data.statuses) statusCounts[s.name] = 0
  for (const u of data.units) if (u.status) statusCounts[u.status.name] = (statusCounts[u.status.name] || 0) + 1
  const haulers = data.parties
    .filter((p) => ['Freight', 'Rail Freight'].includes(p.group?.name))
    .map((p) => ({ id: p.id, name: p.name }))
  const dispatches = (data.dispatches || [])
    .filter((d) => !d.cancelled)
    .map((d) => ({ dispatch_number: d.dispatch_number, hauler_name: d.hauler?.name, destination_name: d.destination?.name }))
  return { buyers, orders, statusCounts, unitCount: data.units.length, haulers, dispatches }
}

function resolveBuyer(parties, ref) {
  if (!ref) return null
  const r = String(ref).toLowerCase()
  return parties.find((p) => String(p.id) === r) ||
    parties.find((p) => p.name.toLowerCase() === r) ||
    parties.find((p) => p.name.toLowerCase().includes(r)) || null
}

function resolveOrder(orders, ref, buyerId) {
  if (!ref && buyerId) return orders.find((o) => o.buyer?.id === buyerId && o.open)
  if (!ref) return null
  const r = String(ref).toLowerCase()
  return orders.find((o) => o.order_number.toLowerCase() === r) ||
    orders.find((o) => `${o.order_number} ${o.customer_reference || ''}`.toLowerCase().includes(r)) || null
}

function selectUnits(units, sel) {
  if (!sel) return []
  let list = units
  if (sel.ids?.length) return list.filter((u) => sel.ids.includes(u.id))
  if (sel.unitNumbers?.length) {
    const set = sel.unitNumbers.map((x) => String(x).toLowerCase())
    return list.filter((u) => set.includes((u.unit_number || '').toLowerCase()))
  }
  if (sel.source) list = list.filter((u) => (u.source?.name || '').toLowerCase() === String(sel.source).toLowerCase())
  if (sel.status) list = list.filter((u) => u.status?.name === sel.status || (u.status?.name || '').toLowerCase().includes(String(sel.status).toLowerCase()))
  if (sel.equipmentType) list = list.filter((u) => (u.equipment_type?.name || '').toLowerCase().includes(String(sel.equipmentType).toLowerCase()))
  if (sel.physicalLocation) list = list.filter((u) => (u.physical_location || '').toLowerCase().includes(String(sel.physicalLocation).toLowerCase()))
  return list
}

// Applies actions against `data` (the shell's current snapshot) using the
// signed-in user's role for permission checks. Returns a human-readable log;
// throws only on unexpected DB errors (permission denials are logged, not thrown).
export async function applyActions(data, actions, role) {
  const log = []
  const { parties, orders, units, statuses, equipTypes } = data
  const statusId = (name) => statuses.find((s) => s.name === name)?.id
  const equip = (name) => equipTypes.find((t) => t.name.toLowerCase() === String(name || '').toLowerCase())

  for (const a of actions || []) {
    try {
      if (a.type === 'create_buyer') {
        if (!can(role, 'createParty')) { log.push(`⚠︎ Your role can't create accounts — ask Janet or an admin.`); continue }
        const buyerGroupId = parties.find((p) => p.group?.name === 'Trailer Buyer')?.group?.id
        await saveParty({
          name: a.name, group_id: buyerGroupId ?? null,
          billing_address: a.billing_address ?? null, payment_terms: a.payment_terms ?? null,
          payment_method: a.payment_method ?? null, deduction_model: a.deduction_model ?? null,
          standard_deductions: a.standard_deductions ?? null,
          destruction_agreement_signed: a.destruction_agreement_signed ?? null,
          rema_member: a.rema_member ?? false, merged_parent: a.merged_parent ?? false,
          general_notes: a.general_notes ?? null,
        })
        log.push(`Created buyer "${a.name}"`)
      } else if (a.type === 'update_buyer') {
        if (!can(role, 'editParty')) { log.push(`⚠︎ Your role can't edit accounts.`); continue }
        const b = resolveBuyer(parties, a.buyer || a.buyerId || a.name)
        if (!b) { log.push(`⚠︎ Couldn't find buyer "${a.buyer || a.name}"`); continue }
        const { type, buyer, buyerId, ...fields } = a
        await saveParty(fields, b.id)
        log.push(`Updated buyer "${b.name}"`)
      } else if (a.type === 'create_order') {
        if (!can(role, 'createOrder')) { log.push(`⚠︎ Your role can't create sales orders.`); continue }
        const b = resolveBuyer(parties, a.buyer || a.buyerId || a.buyerName)
        if (!b) { log.push(`⚠︎ Couldn't find a buyer for the order ("${a.buyer || a.buyerName}")`); continue }
        const order_number = nextOrderNumber(orders)
        await saveOrder({
          order_number, buyer_party_id: b.id,
          customer_reference: a.customer_reference ?? null, item_code: a.item_code ?? null,
          price: a.price ?? null, price_unit: a.price_unit ?? 'per_lb',
          ref_weight_lbs: a.ref_weight_lbs ?? null, header_notes: a.header_notes ?? null,
        })
        log.push(`Created ${order_number} for ${b.name}${a.customer_reference ? ` (${a.customer_reference})` : ''}`)
      } else if (a.type === 'add_units') {
        if (!can(role, 'createUnit')) { log.push(`⚠︎ Your role can't add units.`); continue }
        const rows = (a.units || []).map((u) => {
          const src = resolveBuyer(parties, u.source)
          const et = equip(u.equipmentType)
          return {
            unit_number: u.unitNumber || null, vin: u.vin || null,
            source_party_id: src?.id ?? null, equipment_type_id: et?.id ?? null,
            status_id: statusId(u.status) ?? statusId('Purchased Not Ready'),
            physical_location: u.physicalLocation || null,
            pickup_location_code: u.pickupLocationCode || null,
            pickup_address: u.pickupAddress || null,
            condition_comments: u.comments || null,
            purchase_price: u.purchasePrice ?? null,
            ref_weight_lbs: et?.default_ref_weight_lbs ?? null,
          }
        })
        await addUnits(rows)
        log.push(`Added ${rows.length} unit${rows.length !== 1 ? 's' : ''}`)
      } else if (a.type === 'attach_units') {
        if (!can(role, 'attachUnits')) { log.push(`⚠︎ Your role can't attach units to sales orders.`); continue }
        const b = resolveBuyer(parties, a.buyer || a.buyerName || a.buyerId)
        const o = resolveOrder(orders, a.salesOrder || a.order || a.orderId, b?.id)
        if (!o) { log.push(`⚠︎ Couldn't find a sales order to attach to`); continue }
        const matches = selectUnits(units, a.units || a.select || {}).filter((u) => !u.sales_order?.id)
        await attachUnits(o.id, matches.map((u) => u.id))
        log.push(`Attached ${matches.length} unit${matches.length !== 1 ? 's' : ''} to ${o.order_number} → Sold — Dispatch Required`)
      } else if (a.type === 'set_status') {
        if (!can(role, 'editUnit')) { log.push(`⚠︎ Your role can't change unit status.`); continue }
        const sid = statusId(a.status)
        if (!sid) { log.push(`⚠︎ Unknown status "${a.status}"`); continue }
        const matches = selectUnits(units, a.units || a.select || {})
        await setUnitsStatus(matches.map((u) => u.id), sid)
        log.push(`Moved ${matches.length} unit${matches.length !== 1 ? 's' : ''} → ${a.status}`)
      } else if (a.type === 'create_dispatch') {
        if (!can(role, 'createDispatch')) { log.push(`⚠︎ Your role can't create dispatches — that's logistics/admin.`); continue }
        const hauler = resolveBuyer(parties, a.hauler)
        const dest = resolveBuyer(parties, a.destination)
        const dispatch_number = nextDispatchNumber(data.dispatches || [])
        await saveDispatch({
          dispatch_number,
          hauler_party_id: hauler?.id ?? null,
          destination_party_id: dest?.id ?? null,
          pickup_location: a.pickup_location ?? null, pickup_address: a.pickup_address ?? null,
          destination_address: a.destination_address ?? null,
          scheduled_pickup: a.scheduled_pickup ?? null, delivery_eta: a.delivery_eta ?? null,
          rate: a.rate ?? null, rate_basis: a.rate_basis ?? 'flat',
          notes: a.notes ?? null,
        })
        log.push(`Created ${dispatch_number}${hauler ? ` with ${hauler.name}` : ''}${dest ? ` → ${dest.name}` : ''}`)
      } else if (a.type === 'assign_dispatch') {
        if (!can(role, 'editDispatch')) { log.push(`⚠︎ Your role can't assign dispatches.`); continue }
        const open = (data.dispatches || []).filter((d) => !d.cancelled)
        const ref = (a.dispatch || '').toLowerCase()
        const d = ref
          ? open.find((x) => x.dispatch_number.toLowerCase() === ref)
          : open[open.length - 1]
        if (!d) { log.push(`⚠︎ Couldn't find dispatch "${a.dispatch || '(latest)'}"`); continue }
        const matches = selectUnits(units, a.units || a.select || {}).filter((u) => !u.dispatch?.id)
        await assignUnitsToDispatch(d.id, matches.map((u) => u.id))
        log.push(`Assigned ${matches.length} unit${matches.length !== 1 ? 's' : ''} to ${d.dispatch_number} → Dispatched`)
      } else if (a.type === 'mark_delivered') {
        if (!can(role, 'editDispatch')) { log.push(`⚠︎ Your role can't mark deliveries.`); continue }
        const matches = selectUnits(units, a.units || a.select || {})
        await markUnitsDelivered(matches.map((u) => u.id), statusId('Delivered — Invoice Required'))
        log.push(`Marked ${matches.length} unit${matches.length !== 1 ? 's' : ''} delivered`)
      } else if (a.type === 'add_note') {
        if (!can(role, 'addNote')) { log.push(`⚠︎ Your role can't add notes.`); continue }
        if (a.buyer || a.buyerName) {
          const b = resolveBuyer(parties, a.buyer || a.buyerName)
          if (!b) { log.push(`⚠︎ Couldn't find buyer "${a.buyer || a.buyerName}"`); continue }
          await addNote('party', b.id, a.note, !!a.popup)
          log.push(`Note added to "${b.name}"${a.popup ? ' (pop-up warning)' : ''}`)
        } else {
          const matches = selectUnits(units, a.units || a.select || {})
          for (const u of matches) await addNote('unit', u.id, a.note, !!a.popup)
          log.push(`Note added to ${matches.length} unit${matches.length !== 1 ? 's' : ''}${a.popup ? ' (pop-up warning)' : ''}`)
        }
      } else {
        log.push(`⚠︎ Unknown action: ${a.type}`)
      }
    } catch (e) {
      log.push(`⚠︎ Error on ${a.type}: ${e.message}`)
    }
  }
  return log
}
