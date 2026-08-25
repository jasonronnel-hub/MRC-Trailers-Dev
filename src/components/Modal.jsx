export default function Modal({ title, close, children }) {
  return (
    <div className="modal-wrap" onClick={close}>
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
