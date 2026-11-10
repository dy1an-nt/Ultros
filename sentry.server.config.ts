import * as Sentry from "@sentry/nextjs"
import { SENTRY_DATA_COLLECTION } from "@/lib/sentryDataCollection"

// No DSN → no-op. Secrets never belong in event payloads, so every data
// collection category is off.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    dataCollection: SENTRY_DATA_COLLECTION,
  })
}
