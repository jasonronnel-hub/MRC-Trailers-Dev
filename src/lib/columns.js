// Inventory grid columns — a distinct default set per status view (Jason,
// Sept 2026), user-adjustable and remembered per browser.
//
// Column keys map to renderers in Inventory.jsx. Defaults are the business
// ruling; the user's own picks live in localStorage under one key per view.

export const COLUMNS = {
  bwt:            { label: 'BWT', sort: 'id' },
  unit_number:    { label: 'Unit #', sort: 'unit_number' },
  vin:            { label: 'VIN', sort: 'vin' },
  type:           { label: 'Type' },
  commodity:      { label: 'Commodity', sort: 'commodity_code' },
  make:           { label: 'Make' },
  model_year:     { label: 'Year', sort: 'model_year' },
  source:         { label: 'Source' },
  location:       { label: 'Location', sort: 'physical_location' },
  status:         { label: 'Status', sort: 'status' },
  purchase_date:  { label: 'Purchase date', sort: 'purchase_date' },
  purchase_price: { label: 'Purchase $' },
  ready_date:     { label: 'Ready date', sort: 'ready_date' },
  sold_to:        { label: 'Sold to' },
  sales_order:    { label: 'SO' },
  sale_date:      { label: 'Sale date', sort: 'sold_date' },
  title:          { label: 'Title' },
  dispatch:       { label: 'Dispatch' },
  dispatch_date:  { label: 'Dispatch date', sort: 'dispatch_date' },
  delivery_eta:   { label: 'Sched. delivery' },
  delivered_date: { label: 'Delivered', sort: 'completion_date' },
  invoice:        { label: 'Invoice' },
}

// View key → default column list. Keys match the status short names used
// by the rail plus the Inventory quick views.
export const DEFAULT_COLUMNS = {
  'Purchased Not Ready':            ['bwt', 'unit_number', 'type', 'source', 'location', 'purchase_date', 'status'],
  'Ready — Sales Required':         ['bwt', 'unit_number', 'type', 'source', 'location', 'ready_date', 'status'],
  'Sold — Dispatch Required':       ['bwt', 'unit_number', 'type', 'location', 'sold_to', 'sales_order', 'sale_date', 'title', 'status'],
  'Dispatched — Delivery Required': ['bwt', 'unit_number', 'type', 'location', 'sold_to', 'sales_order', 'dispatch', 'dispatch_date', 'delivery_eta', 'status'],
  'Delivered — Invoice Required':   ['bwt', 'unit_number', 'type', 'sold_to', 'sales_order', 'delivered_date', 'invoice', 'status'],
  'Invoiced — Closed':              ['bwt', 'unit_number', 'type', 'sold_to', 'sales_order', 'invoice', 'delivered_date', 'status'],
  'State Unknown':                  ['bwt', 'unit_number', 'type', 'source', 'location', 'status'],
  // quick views (mixed statuses)
  active:    ['bwt', 'unit_number', 'type', 'source', 'location', 'status', 'sold_to', 'sales_order'],
  attention: ['bwt', 'unit_number', 'type', 'source', 'location', 'status'],
  closed:    ['bwt', 'unit_number', 'type', 'sold_to', 'sales_order', 'invoice', 'status'],
  all:       ['bwt', 'unit_number', 'type', 'source', 'location', 'status', 'sold_to', 'sales_order'],
}

const KEY = (view) => `mrc.columns.${view}`

export function loadColumns(view) {
  try {
    const raw = localStorage.getItem(KEY(view))
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.every((k) => COLUMNS[k])) return arr
    }
  } catch { /* storage unavailable */ }
  return DEFAULT_COLUMNS[view] || DEFAULT_COLUMNS.all
}

export function saveColumns(view, cols) {
  try { localStorage.setItem(KEY(view), JSON.stringify(cols)) } catch { /* ignore */ }
}

export function resetColumns(view) {
  try { localStorage.removeItem(KEY(view)) } catch { /* ignore */ }
  return DEFAULT_COLUMNS[view] || DEFAULT_COLUMNS.all
}
