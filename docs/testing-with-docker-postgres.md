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
export TEST_DATABASE_URL="postgres://glitter:glitter@127.0.0.1:${GLITTER_TEST_DB_PORT}/glitter_test"

pnpm db:test:up
```

The database name deliberately contains `test`; integration tests reject other
database names as a safety check.

## Migrate and test

Keep `TEST_DATABASE_URL` exported in the same shell. The migration script uses
it only as the guarded test target.

```bash
pnpm migrate:test
pnpm test:integration
```

Most integration tests create their own fixtures. To add the optional Clerk
demo users and matching local profiles, only on a Clerk development instance:

```bash
POSTGRES_URL="$TEST_DATABASE_URL" pnpm seed
```

## Stop it

```bash
pnpm db:test:down
```

`db:test:down` retains the worktree's database volume so it can be restarted.
To permanently discard it, run `docker compose -p "glitter-test-${GLITTER_TEST_DB_PORT:-55432}" -f compose.test.yml down -v` after confirming the selected port.

## Troubleshooting

- Port already in use: choose another value, e.g. `export GLITTER_TEST_DB_PORT=55433`, then re-export `TEST_DATABASE_URL`.
- Inspect logs: `pnpm db:test:logs`.
- Do not put the Docker URL in a committed `.env` file. It is shell-local by
  design, so each worktree can select its own database.
