# Docker PostgreSQL for integration tests

Use this when the host PostgreSQL service is unavailable, or when a worktree
needs its own disposable integration-test database. It never uses Railway,
development, or production data.

## Start an isolated database

Choose an unused port for this worktree. The port also scopes the Compose
project and named volume, so concurrent worktrees do not share a container or
data volume.

```bash
export GLITTER_TEST_DB_PORT=55432

pnpm db:test:up
```

The database name deliberately contains `test`; integration tests reject other
database names as a safety check.

## Migrate and test

Keep `GLITTER_TEST_DB_PORT` exported in the same shell. Both commands build the
connection string from it and `compose.test.yml`'s fixed credentials, so there
is nothing else to set — and no value in `.env.local` can redirect them at a
real database.

```bash
pnpm migrate:test
pnpm test:integration
```

Most integration tests create their own fixtures. To add the optional Clerk
demo users and matching local profiles, only on a Clerk development instance,
run `pnpm env:sync` first. If it reports `clerk=missing`, stop: the dashboard
Clerk secrets are unavailable.

```bash
pnpm env:sync
POSTGRES_URL="postgres://glitter:glitter@127.0.0.1:${GLITTER_TEST_DB_PORT}/glitter_test" pnpm seed
```

## Run the app against it

`pnpm dev` reads `POSTGRES_URL`, and unlike the test commands it does not
derive one — left unset it resolves from `.env.local`, whose target varies and
has been Railway. Pass it explicitly every time, in the same shell.

Tag the connection with an `application_name` so this server can be told apart
from every other client of the same database — another worktree's dev server,
`pnpm seed`, drizzle-kit, a stray `psql`. The tag rides in the URL, and
`node-postgres` sends it in the startup packet:

```bash
POSTGRES_URL="postgres://glitter:glitter@127.0.0.1:${GLITTER_TEST_DB_PORT}/glitter_test?application_name=glitter-dev-${GLITTER_TEST_DB_PORT}" pnpm dev
```

First resolve and report the target the server was handed, rather than assuming
it:

```bash
POSTGRES_URL="postgres://glitter:glitter@127.0.0.1:${GLITTER_TEST_DB_PORT}/glitter_test?application_name=glitter-dev-${GLITTER_TEST_DB_PORT}" \
  node -e 'const u = new URL(process.env.POSTGRES_URL); console.log(`${u.hostname}:${u.port}${u.pathname}`)'
```

Then confirm the running server actually attached there, by looking for that
exact tag rather than counting every non-`psql` session:

```bash
docker exec "glitter-test-${GLITTER_TEST_DB_PORT}-postgres-1" psql -U glitter -d glitter_test -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'glitter-dev-${GLITTER_TEST_DB_PORT}';"
```

A non-zero count while the server is serving means the override took. Zero means
it did not, and the server is talking to whatever `.env.local` names — a count
that only proves *some* client is connected proves nothing about this one.

Never report schema state — which tables exist, which migrations ran — without
naming the host, port, and database you read it from, resolved as above.

Sign in with any seeded `+clerk_test` address and `SEED_DEMO_PASSWORD` (or the
default in `scripts/seed/demo-users.ts`): `admin+clerk_test@example.com`,
`illustration+clerk_test@example.com`, `entrepreneurship+clerk_test@example.com`,
and so on. Those addresses use Clerk's fixed test code, so no mail is sent.

## Stop it

```bash
pnpm db:test:down
```

`db:test:down` retains the worktree's database volume so it can be restarted.
To permanently discard it, run `docker compose -p "glitter-test-${GLITTER_TEST_DB_PORT:-55432}" -f compose.test.yml down -v` after confirming the selected port.

## Troubleshooting

- Port already in use: choose another value, e.g. `export GLITTER_TEST_DB_PORT=55433`, and re-run `pnpm db:test:up`.
- Inspect logs: `pnpm db:test:logs`.
- Do not put the Docker URL in a committed `.env` file. It is shell-local by
  design, so each worktree can select its own database.
