# PLAN — Database reliability hardening

Known defects found while diagnosing the production `FATAL 53300`
("sorry, too many clients already") outage and reviewing the fix in
PR #502. Everything here was **left unfixed deliberately** — either it
predates that PR, or it needs a refactor too large to land safely the day
before a reservation opening.

Each item was verified against source on 2026-09-04 unless marked otherwise.
Line numbers are from that date; confirm before acting.

**What PR #502 did fix**, for context: one shared capped pool per process
instead of two, timeouts sized against `vercel.json`'s 100s function cap, a
pool `error` listener, the connection string read through `getPostgresUrl()`,
and one second-checkout self-deadlock in the credit purchase path.

---

## 1. External I/O awaited inside open transactions

**Severity: high — data integrity.** Verified by an AST-ish sweep of every
`.transaction(` block in the repo; these are all four hits.

| Site                                                                                     | Transaction opens                            | The awaited I/O                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------ |
| [`app/lib/festival_activites/actions.ts:1173`](../app/lib/festival_activites/actions.ts) | 1115 (`promoteFromWaitlist`, 1090)           | `sendEmail` (Resend)           |
| [`app/lib/profile_tasks/actions.ts:172`](../app/lib/profile_tasks/actions.ts)            | 155 (`handleReminderEmails`, 151)            | `queueEmails` → `sendEmail`    |
| [`app/lib/profile_tasks/actions.ts:599`](../app/lib/profile_tasks/actions.ts)            | 571 (`handleReservationReminderEmails`, 567) | `queueEmails` → `sendEmail`    |
| [`app/lib/products/scheduled-actions.ts:42`](../app/lib/products/scheduled-actions.ts)   | 34 (`handleOrphanedProductImages`, 8)        | `utapi.deleteFiles`, in a loop |

Why it matters: a transaction stays open across a network call it does not
control. The database connection sits idle-in-transaction holding whatever
locks it took, for as long as the third party takes to answer.

The sharpest case is `promoteFromWaitlist`. It claims a waitlist row with
`FOR UPDATE SKIP LOCKED`, sets `notifiedAt` / `expiresAt` /
`notifiedForDetailId`, and _then_ awaits Resend as the last statement in the
transaction. If that send stalls long enough for the session to be torn down,
the claim rolls back while the invitation may already have been delivered —
`notifiedAt` returns to NULL and the next pass hands the same slot to a second
person. The `catch` only `console.error`s, so nothing surfaces.

`handleOrphanedProductImages` inverts its own stated intent. Its comment says
rows are deleted first "so we can rollback if storage deletion fails", but the
storage deletes are irreversible: on rollback the rows come back pointing at
files that no longer exist, and are re-picked on every subsequent run.

**Fix:** the outbox pattern already used correctly in
[`app/lib/reservations/notification-outbox.ts`](../app/lib/reservations/notification-outbox.ts)
— insert a job row inside `tx`, commit, deliver afterwards. For the reminder
batches, read in the transaction, commit, send outside, and record each send in
its own short transaction. For the image cleanup, note `utapi.deleteFiles` also
accepts an array, so the N sequential calls can be one.

**Interaction with PR #502:** `IDLE_IN_TRANSACTION_TIMEOUT_MS` is deliberately
set to 120s — _above_ the 100s function cap — precisely so it cannot tear these
down mid-flight. An earlier revision of that PR used 30s and would have. If
anyone lowers it below the function cap, these four sites become live
data-corruption bugs. Fix them before touching that constant.

---

## 2. A second connection checked out while inside a transaction

**Severity: high — self-deadlock.** The prohibition is already documented in
[`app/lib/festivals/feature-config-service.ts:3-6`](../app/lib/festivals/feature-config-service.ts):
callers inside a transaction must pass their `tx`, because reaching for the
module-level pool checks out a second connection that only a finishing
transaction can free.

Remaining violations:

| Site                                                                                         | Transaction opens | Call                |
| -------------------------------------------------------------------------------------------- | ----------------- | ------------------- |
| [`app/lib/reservations/payment-service.ts:506`](../app/lib/reservations/payment-service.ts)  | 334               | `fetchAdminUsers()` |
| [`app/lib/reservations/payment-service.ts:693`](../app/lib/reservations/payment-service.ts)  | 574               | `fetchAdminUsers()` |
| [`app/lib/reservations/payment-service.ts:1009`](../app/lib/reservations/payment-service.ts) | 898               | `fetchAdminUsers()` |

[`fetchAdminUsers`](../app/api/users/actions.ts) (`app/api/users/actions.ts:684`)
takes no database handle and always uses the module-level `db`. With
`max: 5`, five concurrent proof submissions each hold a slot and each await a
sixth: hard self-deadlock until `connectionTimeoutMillis` expires.

It compounds: `fetchAdminUsers` catches its own error and returns `[]`. On the
deadlock path the transaction therefore **commits successfully** with
`adminEmails: []` — the payment proof is recorded, no admin is ever notified,
and the request returns 200 with nothing logged as a failure.

**Fix:** give `fetchAdminUsers` an optional db-handle parameter and pass `tx`
at these three sites. Separately, reconsider the `return []` — swallowing a
connection failure into an empty result is what makes this silent. Changing
that error behaviour is a judgement call: it converts silent degradation into
visible failure, which is better, but should not be done immediately before a
high-traffic event.

The systemic version of this fix is to drop the `database = db` default
parameter (the same shape appears in roughly nine modules) so the handle must
always be passed explicitly and the compiler catches omissions.

---

## 3. Pool lifecycle

### 3a. A rejected `BEGIN` leaks a pool slot permanently

**Severity: high.** In drizzle's
`node-postgres/session.cjs` (`transaction()`), the connection is checked out
and `begin` is executed **before** the `try` block, while
`session.client.release()` lives only in that block's `finally`:

```js
const session = ... await this.client.connect() ...
await tx.execute(sql`begin`)      // outside the try
try { ... } finally { session.client.release() }
```

If `BEGIN` rejects — a socket half-closed between checkout and `BEGIN`;
pg-pool does not validate clients on handout — the `finally` never runs and
the slot is gone for the life of the process. At `max: 5`, five such events
leave zero usable slots: every later query waits the full
`connectionTimeoutMillis` and fails, permanently. The previous ~20-slot
ceiling absorbed this; the reduced pool does not.

**Confirmed by experiment**, not only by reading the source. Against
drizzle-orm 0.44.2 with a `max: 3` pool and a `pg.Client` subclass that throws
only on `begin` — so the checkout succeeds and the failure lands exactly where
`session.cjs` runs it:

```
after failed BEGIN #1   total=1 idle=0 waiting=0
after failed BEGIN #2   total=2 idle=0 waiting=0
after failed BEGIN #3   total=3 idle=0 waiting=0

BEGIN now succeeds; can the pool still serve a transaction?
RESULT: pool unusable — TIMED OUT waiting for a connection
final                   total=3 idle=0 waiting=1
```

`totalCount` climbs while `idleCount` stays at zero: every client is checked
out and never returned. Once the pool is full, a subsequent perfectly valid
transaction never gets a connection. The reproduction is a standalone script —
build a `Pool` with `{ Client: BeginFailingClient, max: N }`, wrap it in
`drizzle()`, call `db.transaction()` N times catching each rejection, then let
`begin` succeed and race a real transaction against a timeout.

**Fix:** wrap `transaction()` so the client is released when `BEGIN` fails, or
add a health check that discards and rebuilds the cached pool. The `error`
listener added in PR #502 gives visibility but does not stop the leak.

**On adding a regression test:** it belongs with that fix, not before it. A
test asserting the client _is_ released fails today, and one asserting the leak
exists is a test that must be deleted the moment anybody fixes it. Land the
probe above as the regression test in the same change that repairs the
behaviour, where it guards something real. It needs a live database, so it
belongs in the integration suite and its explicit file list in `package.json`.

### 3b. `pool.end()` poisons the process-global pool

**Severity: medium.** PR #502 caches the pool on `globalThis` and still
exports it. [`scripts/migrate.ts`](../scripts/migrate.ts) (lines 141, 180) and
[`scripts/seed.ts`](../scripts/seed.ts) (lines 22, 61) call `pool.end()`. In a
short-lived script process that is harmless, but in any long-lived process that
reuses `globalThis` — a vitest worker, the dev server — the `??` still sees a
non-nullish value and hands back a dead pool, after which every `connect()`
rejects with "Cannot use a pool after calling end on the pool". Nothing resets
the slot on `SIGTERM` or `beforeExit`.

### 3c. Scripts inherit the request-shaped pool

**Severity: medium.** [`scripts/migrate.ts:2`](../scripts/migrate.ts) imports
`{ pool, db }` from `@/db`, so the migration runner inherits `max: 5` and the
idle-in-transaction bound — settings chosen for short serverless requests, not
for migrations. `pnpm migrate` runs from `vercel-build` on every deploy, and
`migrate.ts:167` calls `ensureDefaultFestivalTerms()`, which opens a
transaction taking the advisory lock
([`app/lib/festival-terms/persist.ts:187`](../app/lib/festival-terms/persist.ts)).
Applying migrations is one-way on production, so a runner torn down partway is
the worst possible failure mode.

**Fix for 3b and 3c together:** give scripts their own `Pool` — no idle bound,
its own `max` — rather than the request-shaped app pool. That removes the
`pool.end()` footgun at the same time.

---

## 4. Query logging is unconditional and barely redacts

**Severity: medium — PII exposure and log volume.** `redactingLogger` in
[`db/index.ts`](../db/index.ts) is attached in every environment, and
`redactQueryParams` only redacts when the SQL text matches
`/external_participants/i`. Every other table logs its bound parameters
verbatim: `users.email` and `users.phone_number`, `guest_email` /
`guest_phone`, `attendee_email`, `recipient_email`, `contact_email` /
`contact_phone`.

drizzle also routes `begin` and `commit` through `logQuery`, so this is one
`console.log` per statement — on the reservation path, roughly 33 per hold.
That is meaningful latency and log spend on exactly the requests that are
already the bottleneck.

**Fix:** gate the logger on `NODE_ENV` / `VERCEL_ENV`, and redact by parameter
shape (anything that looks like an email or phone number) rather than by table
name, which fails open for every table nobody remembered to list.

---

## 5. `POSTGRES_POOL_MAX` sits outside the env schema

**Severity: low.** It is the only server environment variable not validated in
[`env.ts`](../env.ts).

**Partly addressed.** `poolMax()` in [`db/index.ts`](../db/index.ts) now
requires a positive integer and clamps anything above `MAX_POOL_MAX` (20) with
a warning, so the exponent and hex forms `Number` accepts — `1e3` was 1000,
`0x100` is 256 — can no longer authorise an unbounded per-instance pool.
Oversized values clamp rather than reverting to the default, so raising the
knob during an incident cannot hand back a number smaller than the one already
in effect.

**Still open:** an unparseable value — `20 connections`, a typo'd key — falls
back to 5 silently, at module load rather than at boot. Someone raising the cap
mid-incident still gets the old value and may conclude the cap is not the
problem.

**The contract to settle first.** `poolMax()` converts with `Number`, which
accepts more syntax than an environment variable ever means to: `0x10` is 16,
`+7` and `" 7 "` are 7. None of those is plausible intent — they are typos that
currently resolve to a number instead of being caught. Decide explicitly
whether the knob takes **plain decimal digits only**, and write the schema to
say so rather than inheriting whatever `Number` happens to allow.

**Fix.** Recommended, decimal-only:

```ts
POSTGRES_POOL_MAX: z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(20))
  .default("5"),
```

The looser `z.coerce.number().int().positive().max(20).default(5)` also bounds
the value safely, but keeps the surprises. Measured against the project's zod:

| input              | `z.coerce…` | decimal-only |
| ------------------ | ----------- | ------------ |
| `"5"`              | 5           | 5            |
| `"1e3"`            | reject      | reject       |
| `"0x10"`           | **16**      | reject       |
| `"0x100"`          | reject      | reject       |
| `"2.5"`            | reject      | reject       |
| `" 7 "`            | **7**       | reject       |
| `"+7"`             | **7**       | reject       |
| `"20 connections"` | reject      | reject       |

Both bound the value — `1e3` and `0x100` fail `.max(20)` rather than slipping
through — so either is safe. They differ only in whether a malformed value is
caught or quietly reinterpreted.

**Note the behaviour change.** Either schema **rejects** an oversized value at
boot; the current `poolMax()` **clamps** it to 20 and warns. That is a
deliberate trade, not a regression: the clamp exists only because `poolMax()`
runs at module load, where throwing would take the instance down mid-request.
In `env.ts` the parse happens at startup with the rest of the environment, so a
bad value should fail the deploy loudly instead of silently running at a number
nobody chose. Delete `poolMax()` and `MAX_POOL_MAX` when this lands, and keep
the ceiling in the schema.

---

## 6. Capacity: the actual ceiling is a lock, not connections

**Severity: high for any growth in reservation volume.**

Measured 2026-09-04 against a migrated test database, 24 distinct users each
holding a **distinct** stand — no legitimate contention at all:

- concurrent **725ms** vs sequential **749ms** — a **1.03x** speedup.
  Concurrency buys nothing.
- **25 of the 33 queries** in `createStandHold` run between the festival
  `FOR UPDATE` and `COMMIT`, each one a network round trip, all under the lock.
- 300 concurrent holds drain in 6.0s against a local database. Cost scales as
  `25 × RTT`, so latency to the database multiplies the whole critical section.

Two locks in
[`app/lib/reservations/locks.ts`](../app/lib/reservations/locks.ts) cause this:

1. `lockFestivalRow` — `SELECT ... FOR UPDATE` on the single festival row,
   serialising every write for that festival.
2. `lockFestivalTermsDocument` — `pg_advisory_xact_lock` on
   `FESTIVAL_TERMS_DOCUMENT_SLUG`, which is a **constant**. One global lock for
   every festival, app-wide.

**Consequence:** reservation throughput cannot be improved by pool size,
connection count, instance count, or `max_connections`. Those only change
whether waiting clients queue politely or error.

**Fix, in order.** The terms lock is the cheap win: it exists to exclude terms
_publication_, and holds do not need to exclude each other, so a shared lock
for readers with an exclusive lock for the publisher would let holds run
concurrently. Then narrow the festival row lock to what it actually protects —
per-stand or per-sector — or replace it with a conditional
`UPDATE ... WHERE status = 'available'`, which is naturally per-row. Finally,
reduce the round trips: the lock helpers issue one query per id in a loop.

This is correctness-sensitive concurrency work and wants unhurried attention
plus the existing `hold-concurrency.integration.test.ts` coverage extended.

### 6a. Related: the pool cut throttles reads that were never lock-bound

PR #502 is a net 4x reduction in per-instance connections (two module copies at
pg's default 10, down to one pool of 5). Reservation writes lose nothing —
they were serialised by the advisory lock regardless. Page **reads** were never
lock-bound and do absorb the cut. With Fluid Compute multiplexing concurrent
invocations into one process, simultaneous read-heavy requests can queue in
`_pendingQueue` behind the cap.

`max: 5` was chosen as a safe round number under time pressure, not derived.
Once the event has passed, pick it from measured per-instance concurrency
against `max_connections` (currently the Railway default, 100).

---

## 7. Unverified — carried forward for someone to confirm

**Dev-server env reloads may not rebuild the pool.** The claim: Next's dev
server re-runs `loadEnvConfig` in-process on `.env` changes, so a repointed
`POSTGRES_URL` updates `process.env` while the `globalThis`-cached pool keeps
its original connection string. If true, editing `.env.local` from Railway to a
local database during `pnpm dev` would print a reload line while every query
still went to production, with no indication. The same staleness would affect
integration test files that set `process.env.POSTGRES_URL` before importing,
since only the first file in a vitest worker would bind the URL.

This was **not** verified. Before acting on it, reproduce it: start `pnpm dev`
against one database, repoint `.env.local` at another, and check which one
queries actually reach.

**Fix if confirmed:** key the cached pool on the resolved connection string and
rebuild when it changes.
