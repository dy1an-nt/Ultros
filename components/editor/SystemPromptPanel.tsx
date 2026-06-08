"use client"
import { useState } from "react"

interface Props {
  value: string
  onChange: (v: string) => void
}

export function SystemPromptPanel({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors text-left"
      >
        <span className="font-mono text-xs">{open ? "▾" : "▸"}</span>
        <span>System Prompt</span>
        {!open && value && (
          <span className="text-xs text-gray-600 truncate max-w-xs">
            {value.slice(0, 60)}
            {value.length > 60 ? "..." : ""}
          </span>
        )}
      </button>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="You are a helpful assistant..."
          className="w-full bg-gray-950 px-4 py-3 text-gray-300 font-mono text-sm focus:outline-none resize-none border-t border-gray-800"
        />
      )}
    </div>
  )
}
