import Logo from './Logo'

const fmt = (v) => v || '—'

// Printable documents (Phase 3 strawman): dispatch order for the hauler,
// release authorization for the source fleet. Layout and wording are
// first drafts for Kim's pass. Print uses the browser's dialog; the
// .print-area CSS rules hide everything else on paper.
export default function PrintDoc({ kind, dispatch: d, units, close }) {
  const isRelease = kind === 'release'
  return (
    <div className="modal-wrap" onClick={close}>
      <div className="modal" style={{ width: 'min(760px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead no-print">
          <h3>{isRelease ? 'Release authorization' : 'Dispatch order'} — preview</h3>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={() => window.print()}>Print</button>
            <button className="x" onClick={close} aria-label="Close">×</button>
          </div>
        </div>
        <div className="mbody print-area">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
            <Logo height={40} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {isRelease ? 'RELEASE AUTHORIZATION' : 'DISPATCH ORDER'}
              </div>
              <div className="mono" style={{ fontSize: 14 }}>{d.dispatch_number}</div>
              <div className="muted" style={{ fontSize: 12 }}>{new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <dl className="kv" style={{ gridTemplateColumns: '160px 1fr' }}>
            {isRelease ? (<>
              <dt>Authorized carrier</dt><dd><b>{fmt(d.hauler?.name)}</b>{d.hauler_contact ? ` — ${d.hauler_contact}` : ''}</dd>
              <dt>Pickup location</dt><dd>{fmt(d.pickup_location)}{d.pickup_address ? ` — ${d.pickup_address}` : ''}</dd>
              <dt>Scheduled</dt><dd>{fmt(d.scheduled_pickup)}</dd>
            </>) : (<>
              <dt>Carrier</dt><dd><b>{fmt(d.hauler?.name)}</b>{d.hauler_contact ? ` — ${d.hauler_contact}` : ''}</dd>
              <dt>Pickup</dt><dd>{fmt(d.pickup_location)}{d.pickup_address ? ` — ${d.pickup_address}` : ''}</dd>
              <dt>Deliver to</dt><dd><b>{fmt(d.destination?.name)}</b>{d.destination_address ? ` — ${d.destination_address}` : d.destination?.billing_address ? ` — ${d.destination.billing_address}` : ''}</dd>
              <dt>Scheduled pickup</dt><dd>{fmt(d.scheduled_pickup)}</dd>
              <dt>Delivery ETA</dt><dd>{fmt(d.delivery_eta)}</dd>
              {d.rate != null && (<>
                <dt>Rate</dt>
                <dd>${Number(d.rate).toLocaleString()}{d.rate_basis === 'per_unit' ? ' per unit' : d.rate_basis === 'per_mile' ? ' per mile' : ' flat'}</dd>
              </>)}
            </>)}
          </dl>

          <table style={{ marginTop: 6 }}>
            <thead>
              <tr><th>#</th><th>Unit</th><th>Type</th><th>VIN</th></tr>
            </thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={u.id} style={{ cursor: 'default' }}>
                  <td className="muted">{i + 1}</td>
                  <td><b>{u.unit_number || `W${u.legacy_bwt_id ?? u.id}`}</b></td>
                  <td>{u.equipment_type?.name || '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{u.vin || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {isRelease && (
            <p style={{ fontSize: 13, marginTop: 16 }}>
              The units listed above have been purchased by Metal Recycling Corporation and are
              authorized for release to the carrier named above. Please contact MRC with any
              questions before release.
            </p>
          )}
          {d.notes && <p style={{ fontSize: 13, marginTop: 12 }}><b>Notes:</b> {d.notes}</p>}

          <div style={{ marginTop: 28, display: 'flex', gap: 40, fontSize: 12.5 }}>
            <div style={{ flex: 1, borderTop: '1px solid var(--ink)', paddingTop: 4 }}>
              {isRelease ? 'Released by (signature / date)' : 'Driver (signature / date)'}
            </div>
            <div style={{ flex: 1, borderTop: '1px solid var(--ink)', paddingTop: 4 }}>
              MRC Trailers &amp; Containers
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
