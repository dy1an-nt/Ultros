import { sanitizeErrorMessage } from "@/lib/eval/sanitize"

// Minimal structured logger. Emits single-line JSON so Vercel/Sentry can index
// fields, routes through console (the only sink available in serverless), and
// scrubs known secrets from every message and error before it is written.
//
// Levels: error and warn always emit; info/debug are suppressed in production
// to keep function logs lean. Never pass raw request bodies or headers as
// context — only safe identifiers (ids, codes, counts, durations).

type LogLevel = "error" | "warn" | "info" | "debug"
type LogContext = Record<string, string | number | boolean | null | undefined>

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if ((level === "info" || level === "debug") && process.env.NODE_ENV === "production") return

  const entry = {
    level,
    message: sanitizeErrorMessage(message),
    ...context,
    timestamp: new Date().toISOString(),
  }
  const line = JSON.stringify(entry)
  // console is the only sink in serverless; these are not stray debug logs.
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

// Pull a safe, scrubbed message out of any thrown value.
export function errorMessage(err: unknown): string {
  return sanitizeErrorMessage(err instanceof Error ? err.message : String(err))
}

export const logger = {
  error(message: string, context?: LogContext): void {
    emit("error", message, context)
  },
  warn(message: string, context?: LogContext): void {
    emit("warn", message, context)
  },
  info(message: string, context?: LogContext): void {
    emit("info", message, context)
  },
  debug(message: string, context?: LogContext): void {
    emit("debug", message, context)
  },
  // Convenience for catch blocks: scrubs the error and attaches its message.
  exception(message: string, err: unknown, context?: LogContext): void {
    emit("error", message, { ...context, error: errorMessage(err) })
  },
}
