#!/usr/bin/env bash
# One-time provisioning for a cloud agent VM (Claude Code on the web, and any
# other host that runs a root setup script before the agent starts).
#
# Paste this into the environment's "Setup script" field (the trailing `exit 0`
# matters: a non-zero setup script stops the session from starting at all):
#
#   #!/bin/bash
#   REPO="$(ls -d /home/*/glitter-nextjs /workspace/glitter-nextjs 2>/dev/null | head -1)"
#   [ -n "$REPO" ] && bash "$REPO/scripts/cloud-setup.sh"
#   exit 0
#
# The host runs it once per environment, then snapshots the filesystem and
# reuses that snapshot for later sessions. Everything here must therefore be
# idempotent and leave its result *on disk*: a snapshot keeps files, not running
# processes. Per-session work lives in scripts/cloud-session-start.sh.
#
# This script never exits non-zero. A failed step degrades a session; a non-zero
# exit stops the session from starting at all.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MAJOR=24
NODE_PREFIX=/opt/node24
PGURL_BASE="postgres://glitter:glitter@127.0.0.1:5432"

log() { printf '[cloud-setup] %s\n' "$*"; }
warn() { printf '[cloud-setup] WARNING: %s\n' "$*" >&2; }

as_postgres() {
  if command -v sudo >/dev/null 2>&1; then sudo -u postgres "$@"; else su postgres -c "$(printf '%q ' "$@")"; fi
}

# --- Node 24 (package.json engines: >=24; hosts ship 20/21/22) --------------
install_node() {
  if [ -x "$NODE_PREFIX/bin/node" ]; then
    log "node $("$NODE_PREFIX/bin/node" -v) already installed at $NODE_PREFIX"
    return
  fi
  local version archive
  version="$(curl -fsSL --max-time 60 https://nodejs.org/dist/index.json |
    grep -o "\"version\":\"v${NODE_MAJOR}\.[0-9.]*\"" | head -1 | cut -d'"' -f4)"
  if [ -z "$version" ]; then
    warn "could not resolve the latest v$NODE_MAJOR release; staying on $(node -v 2>/dev/null || echo 'system node')"
    return
  fi
  archive="node-$version-linux-x64"
  if curl -fsSL --max-time 300 "https://nodejs.org/dist/$version/$archive.tar.xz" | tar -xJ -C /opt; then
    ln -sfn "/opt/$archive" "$NODE_PREFIX"
    log "installed node $version"
  else
    warn "node $version download failed; staying on $(node -v 2>/dev/null || echo 'system node')"
  fi
}

# Put Node 24 ahead of the host's default node for every shell the agent opens.
# pnpm itself stays on the host's PATH and runs under whichever node wins here.
persist_path() {
  [ -x "$NODE_PREFIX/bin/node" ] || return 0
  printf 'export PATH="%s/bin:$PATH"\n' "$NODE_PREFIX" > /etc/profile.d/node24.sh
  chmod 0644 /etc/profile.d/node24.sh
  local rc="${HOME:-/root}/.bashrc"
  grep -qs 'node24/bin' "$rc" ||
    printf '\n# glitter-nextjs needs node >=24\nexport PATH="%s/bin:$PATH"\n' "$NODE_PREFIX" >> "$rc"
}

start_postgres() {
  service postgresql start >/dev/null 2>&1 || pg_ctlcluster 16 main start >/dev/null 2>&1
  local i
  for i in $(seq 1 30); do
    pg_isready -h 127.0.0.1 -p 5432 -q && return 0
    sleep 1
  done
  return 1
}

# Local role + databases matching the URLs the repo's scripts expect. Superuser
# because migration 0142 runs CREATE EXTENSION pg_trgm. This is a throwaway VM
# database with a throwaway password; it is never a deployment target.
provision_postgres() {
  as_postgres psql -X -q -v ON_ERROR_STOP=1 -c \
    "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'glitter') THEN CREATE ROLE glitter LOGIN SUPERUSER PASSWORD 'glitter'; END IF; END \$\$;" ||
    { warn "could not create the glitter role"; return 1; }
  local db
  for db in glitter_dev glitter_test; do
    if [ "$(as_postgres psql -X -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")" != "1" ]; then
      as_postgres createdb -O glitter "$db" && log "created database $db"
    fi
  done
}

# scripts/migrate.ts has no name guard of its own, so the target is pinned here
# instead of read from POSTGRES_URL. The `:-` fallbacks only fill a variable
# that is *unset*, so a real dashboard secret is never shadowed by a placeholder
# (env.ts validates these keys even for a migration that never uses them).
migrate_db() {
  local db="$1" log_file="/tmp/glitter-migrate-$1.log"
  if (cd "$REPO_DIR" && \
      POSTGRES_URL="$PGURL_BASE/$db" \
      CLERK_SECRET_KEY="${CLERK_SECRET_KEY:-sk_test_setup_placeholder}" \
      RESEND_API_KEY="${RESEND_API_KEY:-re_setup_placeholder}" \
      UPLOADTHING_TOKEN="${UPLOADTHING_TOKEN:-ut_setup_placeholder}" \
      pnpm exec tsx scripts/migrate.ts > "$log_file" 2>&1); then
    log "migrated $db"
  else
    warn "migrating $db failed; see $log_file"
  fi
}

# Opt-in: the Docker test database needs production.cloudfront.docker.com on the
# environment's allowed domains (the Trusted default list omits that blob host,
# so the pull 403s). With GLITTER_TEST_DB_PORT=5432 the suites use the local
# cluster above and no image is needed.
pull_test_image() {
  [ "${GLITTER_CLOUD_PULL_TEST_IMAGE:-0}" = "1" ] || return 0
  command -v docker >/dev/null 2>&1 || return 0
  dockerd >/tmp/dockerd.log 2>&1 &
  local i
  for i in $(seq 1 20); do docker info >/dev/null 2>&1 && break; sleep 1; done
  (cd "$REPO_DIR" && docker compose -f compose.test.yml pull) || warn "test image pull failed"
}

log "provisioning $REPO_DIR"
install_node
persist_path
export PATH="$NODE_PREFIX/bin:$PATH"

if (cd "$REPO_DIR" && pnpm install --frozen-lockfile); then
  log "installed dependencies with $(node -v)"
else
  warn "pnpm install failed"
fi

if start_postgres; then
  provision_postgres && { migrate_db glitter_dev; migrate_db glitter_test; }
  pull_test_image
  # Leave the cluster stopped so the snapshot captures a cleanly shut down data
  # directory; scripts/cloud-session-start.sh starts it per session.
  service postgresql stop >/dev/null 2>&1 || pg_ctlcluster 16 main stop >/dev/null 2>&1
  log "postgres provisioned and stopped for snapshotting"
else
  warn "postgres did not start; sessions will have no local database"
fi

log "done"
exit 0
