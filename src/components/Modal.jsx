export default function Modal({ title, close, children }) {
  return (
    // stopPropagation: a modal opened from inside a drawer must not close
    // the drawer when its backdrop is clicked.
    <div className="modal-wrap" onClick={(e) => { e.stopPropagation(); close() }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{title}</h3>
          <button className="x" onClick={close} aria-label="Close">×</button>
        </div>
        <div className="mbody">{children}</div>
      </div>
    </div>
  )
}
