import React, { useState, useEffect } from 'react'

/**
 * A number input that does not fight you while typing.
 * Controlled inputs that parse-and-clamp on every keystroke reject intermediate
 * states ("", "1.", "-") and make the numeric keypad feel broken. This keeps a
 * local string while focused and only commits a clamped number on blur / Enter.
 */
export default function NumberField({ value, onCommit, min = -Infinity, max = Infinity, step = 1, style, title }) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => { if (!editing) setText(String(value)) }, [value, editing])

  const commit = () => {
    setEditing(false)
    const n = Number(text)
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
    else setText(String(value))
  }

  return (
    <input
      type="text" inputMode="decimal" title={title} style={style}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit(); e.currentTarget.blur() }
        else if (e.key === 'Escape') { setText(String(value)); setEditing(false); e.currentTarget.blur() }
        else if (e.key === 'ArrowUp') { onCommit(Math.min(max, value + step)); e.preventDefault() }
        else if (e.key === 'ArrowDown') { onCommit(Math.max(min, value - step)); e.preventDefault() }
      }}
    />
  )
}
