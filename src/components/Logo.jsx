import { useState } from 'react'

// The real MRC logo lives at public/mrc-logo.png (transparent background,
// designed to sit on white). Until the file is present, fall back to a quiet
// text wordmark — never recreate the mark graphically.
export default function Logo({ className, height }) {
  const [missing, setMissing] = useState(false)
  if (missing) {
    return (
      <div className="fallback">
        Metal Recycling Corporation
        <small>Trailers &amp; Containers</small>
      </div>
    )
  }
  return (
    <img
      src="/mrc-logo.png"
      alt="Metal Recycling Corporation"
      className={className}
      style={height ? { height } : undefined}
      onError={() => setMissing(true)}
    />
  )
}
