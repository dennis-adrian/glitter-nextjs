#!/usr/bin/env bash
# SessionStart hook for cloud agent sessions (.claude/settings.json).
#
# The environment snapshot a setup script produces keeps files, not processes,
# and a session can start on a branch whose lockfile or migrations moved ahead
# of that snapshot. This script covers both, and no-ops outside a cloud session
# so local runs are unaffected.
#
# Its stdout becomes context the agent reads, so it stays to a few lines and
# sends command output to log files. It always exits 0: a non-zero exit prints
# a hook warning, and exit code 2 would block the session entirely.

set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR" || exit 0
export PATH="/opt/node24/bin:$PATH"

PGURL_BASE="postgres://glitter:glitter@127.0.0.1:5432"
notes=()

# --- dependencies ----------------------------------------------------------
if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
  if pnpm install --frozen-lockfile > /tmp/glitter-pnpm-install.log 2>&1; then
    notes+=("dependencies installed")
  else
    notes+=("pnpm install FAILED (/tmp/glitter-pnpm-install.log)")
  fi
fi

# --- local postgres --------------------------------------------------------
db_ready=0
if pg_isready -h 127.0.0.1 -p 5432 -q 2>/dev/null; then
  db_ready=1
else
  service postgresql start >/dev/null 2>&1 || pg_ctlcluster 16 main start >/dev/null 2>&1
  for _ in $(seq 1 20); do
    pg_isready -h 127.0.0.1 -p 5432 -q 2>/dev/null && { db_ready=1; break; }
    sleep 1
  done
fi

# --- migrations ------------------------------------------------------------
# Only ever applied to the local cluster: scripts/migrate.ts has no name guard
# and applying is one-way, so a POSTGRES_URL pointing anywhere else is reported
# and left alone rather than migrated.
migrate_db() {
  local db="$1"
  POSTGRES_URL="$PGURL_BASE/$db" \
  CLERK_SECRET_KEY="${CLERK_SECRET_KEY:-sk_test_session_placeholder}" \
  RESEND_API_KEY="${RESEND_API_KEY:-re_session_placeholder}" \
  UPLOADTHING_TOKEN="${UPLOADTHING_TOKEN:-ut_session_placeholder}" \
  pnpm exec tsx scripts/migrate.ts > "/tmp/glitter-migrate-$db.log" 2>&1
}

target="${POSTGRES_URL:-$PGURL_BASE/glitter_dev}"
target_display="$(printf '%s' "$target" | sed -E 's#^[a-z+]+://([^@/]*@)?##; s#\?.*$##')"
target_db="${target##*/}"
target_db="${target_db%%\?*}"
if [ "$db_ready" = "1" ]; then
  case "$target" in
    *@127.0.0.1:5432/*|*@localhost:5432/*)
      migrate_db "$target_db" || notes+=("migrating $target_db FAILED")
      ;;
    *)
      notes+=("POSTGRES_URL is not the local cluster - left untouched")
      ;;
  esac
  migrate_db glitter_test || notes+=("migrating glitter_test FAILED")
else
  notes+=("postgres did NOT start - see scripts/cloud-setup.sh")
fi

# --- report ----------------------------------------------------------------
printf 'Cloud session ready: node %s, pnpm %s.\n' "$(node -v 2>/dev/null)" "$(pnpm -v 2>/dev/null)"
if [ "$db_ready" = "1" ]; then
  printf 'Local postgres is running. POSTGRES_URL resolves to %s; glitter_test is migrated (GLITTER_TEST_DB_PORT=5432 runs the integration suites against it, no Docker).\n' "$target_display"
fi
[ ${#notes[@]} -gt 0 ] && printf '%s\n' "${notes[@]}"
exit 0
