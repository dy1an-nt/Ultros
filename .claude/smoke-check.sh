#!/usr/bin/env bash
# Ultros smoke check — runs on SessionStart so Claude has a fresh
# health snapshot before any work begins. Non-blocking: results print
# regardless of pass/fail.

set -u

ROOT="/Volumes/Untitled/Ultros"

results=""
ok()   { results+="  ✓ $1"$'\n'; }
fail() { results+="  ✗ $1"$'\n'; }

# 1. env file present and non-empty
[ -s "$ROOT/.env.local" ] && ok ".env.local present" || fail ".env.local missing/empty"

# 2. required env vars set
required_vars=(
  DATABASE_URL
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  CLERK_SECRET_KEY
  ANTHROPIC_API_KEY
)
env_content=$(cat "$ROOT/.env.local" 2>/dev/null)
for var in "${required_vars[@]}"; do
  echo "$env_content" | grep -q "^${var}=" && ok "env: $var" || fail "env: $var missing"
done

# 3. key dependencies installed
deps=(
  "next"
  "@clerk/nextjs"
  "@prisma/client"
  "ai"
  "@ai-sdk/anthropic"
)
for dep in "${deps[@]}"; do
  dep_path=$(echo "$dep" | sed 's|@||;s|/|-|')
  [ -d "$ROOT/node_modules/$dep" ] && ok "dep: $dep" || fail "dep missing: $dep"
done

# 4. AGENTS.md present (CLAUDE.md @-imports it)
[ -s "$ROOT/AGENTS.md" ] && ok "AGENTS.md present" || fail "AGENTS.md missing"

# 5. Prisma schema valid
if (cd "$ROOT" && npx prisma validate) >/tmp/ultros-prisma.log 2>&1; then
  ok "prisma schema valid"
else
  fail "prisma schema invalid (see /tmp/ultros-prisma.log)"
fi

# 6. TypeScript clean
if (cd "$ROOT" && node node_modules/typescript/lib/tsc.js --noEmit) >/tmp/ultros-tsc.log 2>&1; then
  ok "tsc --noEmit clean"
else
  fail "tsc --noEmit failed (see /tmp/ultros-tsc.log)"
fi

msg="Ultros smoke check:
$results"

jq -Rn --arg m "$msg" '{
  systemMessage: $m,
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: $m }
}'
