# Commits

- Following the Conventional Commits guideline, write commit messages that briefly describe the staged changes. The commit message can be a one-liner subject, or a subject plus a body based on how large the diff is

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## The project

Glitter (`glitter-nextjs`, "Productora Glitter") is a Spanish-language Next.js 16 (App Router, Turbopack, React 19) festival-operations platform: public storefront (`/merch`, `/supplies`), participant portal, admin dashboard, stand reservations, and store orders. Data lives in PostgreSQL via Drizzle ORM. Standard scripts are in `package.json`; product docs are in `docs/PRD-*.md`.

## Cloud agent VMs

Notes for working on a disposable cloud VM. The first section holds what is true on any of them; the host-specific sections below it differ mostly in where secrets come from and who installs what.

### On every VM

- Node: the repo requires Node `>=24` and the base images default to Node 22 on `PATH`. Each host section says where Node 24 comes from.
- PostgreSQL runs locally (apt package, cluster `16 main` on port 5432), with role `glitter`/`glitter` and databases `glitter_dev` and `glitter_test`. Postgres is **not** a dashboard secret; always use those local URLs on a VM.
- If the local service is unavailable or a worktree needs its own isolated test DB, follow [`docs/testing-with-docker-postgres.md`](docs/testing-with-docker-postgres.md). Never use a remote deployment database for destructive integration tests.
- `env.ts` and `env.client.ts` validate with zod at import time, so anything that loads app code — `migrate`, `seed`, `dev`, `build`, the integration suites — fails outright unless `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `UPLOADTHING_TOKEN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` are set, along with `POSTGRES_URL` (or all four `POSTGRES_*` parts). Missing keys surface as a `ZodError` listing them, not as a runtime 500.
- Resend and PostHog stay no-ops unless `VERCEL_ENV` is production. Do not treat a redacted `VERCEL_ENV` as a missing secret.
- Apply migrations after schema changes: `pnpm migrate` (dev DB), or `pnpm migrate:test` for the test database. `migrate:test` builds its own connection string from `compose.test.yml`'s fixed credentials and `GLITTER_TEST_DB_PORT`, so there is nothing to export and `.env.local` cannot redirect it at a real database.

```bash
export GLITTER_TEST_DB_PORT=55432   # 5432 on a VM using the local cluster
pnpm db:test:up && pnpm migrate:test
```

- **`scripts/migrate.ts` has no test/ci name guard of its own** — it migrates whatever `POSTGRES_URL` resolves to, and applying is one-way. Only `pnpm migrate:test` is safe to run unattended; `pnpm migrate` targets whatever `.env.local` currently points at, which is not fixed and has been Railway. Check before running it.
- After migrate, run `pnpm seed` for Clerk demo users + local profiles (see **Development seed** below). Storefront products and other domain fixtures are not seeded yet.
- Commands: env file `pnpm env:sync`; dev server `pnpm dev` (http://localhost:3000); lint `pnpm exec eslint .` (repo currently has pre-existing lint errors/warnings — there is no `lint` npm script); unit tests `pnpm exec vitest run`; integration tests `pnpm test:integration` (needs a migrated test database); build `pnpm build` (runs `drizzle-kit generate` then `next build`, and prerenders pages that query the database, so the target must be migrated).
- `next dev`/`next build` rewrite the `nextjs-agent-rules` block in this file and `CLAUDE.md`; commit that change rather than fighting it.

### Cursor Cloud

The startup update script already runs `pnpm install`.

- Node 24 is installed via `nvm` and preferred on `PATH` through `~/.bashrc`. If a shell shows Node 22, run `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` (or `nvm use 24`).
- Secrets: dashboard secrets are already injected into the VM. Do **not** invent `*_placeholder_not_real` keys, do **not** copy empty values from `.env.example` into `.env.local`, and do **not** source a hand-written placeholder file into the shell. Next.js prefers `process.env` over `.env.local`, so a placeholder in the shell hides the real Clerk/UploadThing/Resend keys and public pages 500.
  - `CLOUD_AGENT_ALL_SECRET_NAMES` is the full dashboard list. `CLOUD_AGENT_INJECTED_SECRET_NAMES` is only the subset copied onto **this** process; missing names often still exist on a parent `/proc/<pid>/environ` (commonly the `/exec-daemon/node` supervisor).
  - Before `pnpm dev`, `pnpm seed`, sourcing `.env.local`, or any Clerk-backed check, run `pnpm env:sync`. That rewrites git-ignored `.env.local` from process/parent secrets plus local Postgres and refuses to write placeholders when a real value exists. `pnpm dev` / `pnpm migrate` / `pnpm seed` already run this first.
  - If `pnpm env:sync` prints `clerk=missing`, stop and say the dashboard Clerk secrets are unavailable. Never fabricate well-formed fake keys so the app "boots".

### Claude Code on the web

Two committed scripts do the provisioning; both are idempotent and both exit 0 even when a step fails, because a non-zero exit stops the session from starting.

- [`scripts/cloud-setup.sh`](scripts/cloud-setup.sh) goes in the environment's **Setup script** field, invoked by a four-line shim that locates the checkout and ends in `exit 0` (the script's own header comment has it verbatim). It installs Node 24 at `/opt/node24` (ahead of the host's Node 22 on `PATH`), runs `pnpm install --frozen-lockfile`, creates the `glitter` role and both databases, migrates them, and stops the cluster so the snapshot captures a clean data directory. It runs once per environment; the host then snapshots the filesystem and skips it for later sessions.
- [`scripts/cloud-session-start.sh`](scripts/cloud-session-start.sh) runs as a `SessionStart` hook from `.claude/settings.json` on every session, because a snapshot keeps files but no running processes. It starts Postgres, reinstalls dependencies when `pnpm-lock.yaml` moved ahead of `node_modules`, and migrates the local databases — never a `POSTGRES_URL` pointing anywhere but `127.0.0.1:5432`, which it reports and leaves alone. It no-ops unless `CLAUDE_CODE_REMOTE` is `true`, so local sessions are unaffected.
- There are no dashboard secrets here. `CLOUD_AGENT_*` is unset, so `pnpm env:sync` reports `cloud=false` and writes nothing, and `.env.local` does not exist — the Cursor guidance above about `env:sync` repairing the environment does not apply. Values come from the environment's **Environment variables** field at claude.ai/code and arrive as ordinary process env. Anyone who can use the environment can read them, so they hold development-instance keys only: never an `sk_live` key or a deployment `POSTGRES_URL`.
- Set `GLITTER_TEST_DB_PORT=5432` so `migrate:test` and `test:integration` use the local cluster. `pnpm db:test:up` fails under the default **Trusted** network policy: the Docker Hub blob host `production.cloudfront.docker.com` is not on the allowlist, so the `postgres:16` pull 403s. To use the Docker path anyway, add that host to a **Custom** allowlist and set `GLITTER_CLOUD_PULL_TEST_IMAGE=1` so the setup script pulls the image into the snapshot.

## Development seed (demo users)

`pnpm seed` is **dev-only** and idempotent. It upserts Clerk development users (`+clerk_test` emails) plus matching rows in local Postgres.

- Gate: requires `CLERK_SECRET_KEY` starting with `sk_test_`, and refuses `VERCEL_ENV`/`NODE_ENV=production` (or `ALLOW_DEV_SEED=false`).
- Password: `SEED_DEMO_PASSWORD`, or default `Glitter-Dev-Seed-1!` when unset.
- Notification mail: `SEED_DEMO_EMAIL_BASE` is subaddressed per role (`base+admin@…`); unset it defaults to the undeliverable `glitter-demo@example.test`, so set it to a real inbox when you need to read seed mail.
- Accounts: `admin+clerk_test@example.com` (admin), `festival-admin+clerk_test@example.com`, verified participants (role `user`) `illustration+clerk_test@example.com` / `gastronomy+clerk_test@example.com` / `entrepreneurship+clerk_test@example.com`, and `pending+clerk_test@example.com`. The unused `artist` role and deprecated `new_artist` category are not seeded.
- OTP for `+clerk_test` addresses on Clerk development instances is `424242`.
