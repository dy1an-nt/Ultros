// Global test setup. Provides harmless fallback values for env vars that some
// modules read at import time (e.g. lib/prisma.ts builds a connection pool on
// first import). These never connect during pure unit tests; integration tests
// override them with a real test database URL via CI / the environment.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/ultros_test"
process.env.DB_PASSWORD ??= "test"
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000"
