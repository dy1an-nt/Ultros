"use client"
import { useEffect, useRef } from "react"
import { EditorView, lineNumbers, highlightActiveLine, drawSelection, keymap } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { oneDark } from "@codemirror/theme-one-dark"

interface Props {
  value: string
  onChange: (value: string) => void
}

export function PromptEditor({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          oneDark,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
          EditorView.theme({
            "&": { height: "100%", minHeight: "300px", fontSize: "13px" },
            ".cm-scroller": { fontFamily: "ui-monospace, 'Fira Code', monospace", overflow: "auto" },
            ".cm-content": { padding: "12px 0" },
            ".cm-focused": { outline: "none" },
          }),
          EditorView.lineWrapping,
        ],
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => view.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external value changes (version restore)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return <div ref={containerRef} className="h-full min-h-[300px] w-full" />
}
