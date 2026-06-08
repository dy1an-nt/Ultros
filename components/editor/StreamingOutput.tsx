"use client"

interface Output {
  text: string
  done: boolean
}

export function StreamingOutput({ output }: { output: Output | null }) {
  if (!output) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
        Run a prompt to see output here
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-200 whitespace-pre-wrap min-h-[200px]">
      {output.text}
      {!output.done && (
        <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  )
}
