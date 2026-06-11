import * as Sentry from "@sentry/nextjs"

// No DSN → no-op. Secrets never belong in event payloads: sendDefaultPii off,
// and request bodies are not attached.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}
