import { useState } from 'react'
import SupplierReport from './SupplierReport'
import TuesdayReport from './TuesdayReport'

// Reports hub: Kim's real supplier inventory/removal report (rebuilt from
// her fxg_inventory report artifact) + the internal pipeline digest strawman.
export default function Reports(props) {
  const [view, setView] = useState('supplier')
  return (
    <div>
      <div className="pagehead no-print">
        <h2>Reports</h2>
        <span className="sub">
          {view === 'supplier'
            ? 'supplier inventory / removal report — goes to the supplier’s managers + MRC'
            : 'internal pipeline digest — strawman for Kim'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span className={'chip' + (view === 'supplier' ? ' on' : '')} onClick={() => setView('supplier')}>Supplier report (Kim’s)</span>
          <span className={'chip' + (view === 'pipeline' ? ' on' : '')} onClick={() => setView('pipeline')}>Pipeline digest</span>
        </span>
      </div>
      {view === 'supplier' ? <SupplierReport {...props} /> : <TuesdayReport {...props} />}
    </div>
  )
}
