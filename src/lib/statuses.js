// Status display rules (standing design system):
// copper = in motion / needs action, steel = neutral or completed,
// error = State Unknown. Color is never the only signal — pills always
// carry the text label.
export const STATUS_META = {
  'Purchased Not Ready':            { short: 'Not Ready',   tone: 'steel' },
  'Ready — Sales Required':         { short: 'Ready · Sell', tone: 'copper' },
  'Sold — Dispatch Required':       { short: 'Sold',        tone: 'copper' },
  'Dispatched — Delivery Required': { short: 'Dispatched',  tone: 'copper' },
  'Delivered — Invoice Required':   { short: 'Delivered',   tone: 'steel' },
  'Invoiced — Closed':              { short: 'Invoiced',    tone: 'steel' },
  'State Unknown':                  { short: 'Unknown',     tone: 'error' },
}

export const toneColor = (tone) =>
  tone === 'copper' ? 'var(--copper)' : tone === 'error' ? 'var(--error)' : 'var(--steel)'

export const statusMeta = (name) => STATUS_META[name] || { short: name, tone: 'steel' }
