# Implementation: Reservation flow — launch-safety batch

**Product:** Glitter
**Date:** 2026-11-06
**Status:** Specified, ready to implement
**Base branch:** `feature/reservation-flow-launch-fixes` (PR #636; see §2)
**Target:** Next.js 16.4.2 App Router, React 19 (React Compiler on), PostgreSQL/Drizzle, Tailwind v4, installed PWA

---

## 1. Decision

Six small, independent fixes to how the stand-reservation flow behaves *under contention*: what a
participant sees when a stand is lost or a confirm hiccups, how the hold clock is measured, and how the
admin notification fan-out behaves in a burst. They came out of the launch review as the items that are
not about speed (that was `IMPLEMENTATION-reservation-flow-launch-fixes.md`) but about **not losing a
hold or misreading the map when many people reserve at once**.

Implement in this order; one Conventional Commit per item; run the listed tests after each.

| # | Item | Touches | Effort | Spec |
| - | ---- | ------- | ------ | ---- |
| 1 | Pause the per-admin `reservation_created` email behind a feature flag | feature_flags registry, notification-outbox | S | §4 |
| 2 | "Reservado" legend entry and a distinct colour for `reserved` stands | map-utils, globals.css, map-legend, stand-info-card (1 line) | S | §5 |
| 3 | Start the hold clock after the locks in `createStandHold` | hold-service | S | §6 |
| 4 | Mark a lost stand taken at once and re-poll immediately | use-stand-polling, stand-info-card, client-map | S–M | §7 |
| 5 | Server-driven countdown; never cancel a hold from the phone's clock | dto, map-queries (1 line), hold-confirmation-client | S | §8 |
| 6 | Stay on the confirm screen with "Reintentar" on `CONFLICT_RETRY` | hold-confirmation-client | S | §9 |

Items 5 and 6 both edit `hold-confirmation-client.tsx` (different regions: the countdown block vs
`handleConfirm`); do 5 first. Items 2 and 4 both touch `stand-info-card.tsx` (one ternary vs the failure
branch); no conflict.

Every spec was written against the code and then checked by a second reviewer who opened each cited
file in a checkout of the base branch and tried to break the spec; the corrections are folded in. Line
numbers were verified at `23870770` on that branch; the branch has since merged `develop`
(`8de83335`), so treat them as hints and open the file.

## 2. Timing and the deploy question

Reservations open **tonight at 20:00 America/La_Paz**. This batch was specified at 19:00 and cannot be
deployed before the opening. Two consequences:

- **Do not deploy during the opening rush.** A deploy makes every open tab's server actions fail with a
  generic error (PR #579, "tell stale tabs to reload", is not merged). Deploy at a quiet moment — late
  tonight once the first wave has confirmed, or tomorrow morning. Holds and confirms continue for days,
  so every item here still pays off.
- **Item 1 only helps bursts that happen after it is deployed.** If the opening-night fan-out is the
  concern, there is no code-free switch; the only lever before 20:00 is the number of `role = 'admin'`
  accounts, which is not recommended.

The base branch is `feature/reservation-flow-launch-fixes` (PR #636 against `develop`). Create
`feature/reservation-launch-safety` from it and rebase onto it before each push; if #636 is merged
first, rebase onto `develop` instead.

## 3. Conventions

- Spanish copy in voseo. Dates/times through `app/lib/formatters.ts`.
- Node ≥ 24 (`export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` when the shell shows 22; if that
  path is absent on the machine, Node 22 runs vitest 4 fine).
- `pnpm exec tsc --noEmit`; eslint on touched files (tsconfig has no `noUnusedLocals`, so eslint is
  what catches orphaned imports); `pnpm exec vitest run <paths>`; integration per §11.
- No schema change anywhere in this batch (`createdAt`/`updatedAt` in §6 are existing columns).
- Never run `pnpm migrate` or `pnpm seed` without resolving `POSTGRES_URL` first (AGENTS.md).

---

## 4. Item 1 — Pause the per-admin email for `reservation_created` (effort S)

**What happens today.** `hold-service.ts` (`:634` on the branch) `fetchAdminUsers()` → (`:1050-1059`)
`enqueueAdminAndOwnerNotifications(tx, { kind: "reservation_created", ownerEmail: null, adminEmails: admins })`;
the same shape in `admin-actions.ts:378-387`. These are the only two enqueue sites, and **both pass
`ownerEmail: null` — the participant gets no `reservation_created` email at all**; the burst is purely
one email per admin per reservation. `notification-outbox.ts:749-761` builds one job per admin (dedupe
`reservation_created:<id>:admin:<adminId>`); `notification-queue.ts:96-162` inserts the job **and the
inbox mirror in the same transaction** (`mirrors/reservation-jobs.ts:187-201` → kind
`reservation_created_admin`, which has no `push`). Email: `scheduleReservationNotificationJobs`
(`:67-82`, concurrent in `after()`) → `attemptReservationNotificationJob` (`:608-688`) → `deliverJob`
(`:171-190`) → Resend; the `*/5` cron drains 50 at a time (`:690-719`). N admins × 100 reservations in a
minute → Resend 429s, 30 s backoff, and the voucher-related emails share that queue.

**Options considered.** (a) A per-kind email switch for outbox jobs does not exist (`KindDefinition.email`
in `kinds/types.ts:27` governs `notify()` deliveries only). (b) **Feature flag — chosen.** The registry is
code-owned (`feature_flags/registry.ts:12-22`), the row is created on first read with
`onConflictDoNothing` (`data.ts:43-87`) → no migration, no seed; flippable by a global admin at
`/dashboard/feature_flags`, cache expired by `actions.ts:54-57`; `push/send.ts:96-114` already reads a
flag from the same `after()` drain, so `unstable_cache` inside `after()` has a precedent. (c) Env var:
two redeploys per flip. (d) `adminEmails: []`: no job → no inbox mirror. (e) Digest: later.

The skip must happen at **delivery** time so the job row, dedupe key and inbox mirror are untouched.

**Changes.**

- `app/lib/feature_flags/registry.ts` — after `comunicados` (`:69-74`, object closes `:75`): key
  `reservation_created_admin_email`, `label: "Correo a administración por reserva creada"`, description:
  *Pública = cada administrador recibe el correo «Nueva reserva creada». Oculta o Solo administración =
  no se envía; la notificación en Administración se guarda igual. Las personas agregadas abajo no
  cuentan para esta bandera.* `defaultVisibility: "public"` (today's behaviour on deploy).
  `FeatureFlagKey = keyof typeof FEATURE_FLAGS` (`:77`) and the dashboard list iterate the registry, so
  nothing else needs a change.
- `app/lib/feature_flags/data.ts:115-117` — the comment claims every default is closed; rewrite: this
  flag falls back to `public` on a read failure (`fetchFeatureFlagRule`, `:146-165`, swallows errors and
  returns the default), i.e. a DB outage keeps sending the email — today's behaviour.
- `app/lib/reservations/notification-outbox.ts:24-40` — import `fetchFeatureFlagRule` from
  `@/app/lib/feature_flags/data` and `isFeatureLaunchedForParticipants` from
  `@/app/lib/feature_flags/visibility` (**not** `feature_flags/helpers.ts`, which pulls `next/headers`
  and the Clerk profile).
- `notification-outbox.ts` after `:550` (beside `isCreditNotificationKind`):
  `async function adminReservationCreatedEmailOn() { return isFeatureLaunchedForParticipants(await fetchFeatureFlagRule("reservation_created_admin_email")); }`
  (`sharedCache` serves it ≤ 300 s).
- `notification-outbox.ts:617`, inside the `try` before the dispatch-by-kind chain:
  `const skipped = job.notificationKind === "reservation_created" && !(await adminReservationCreatedEmailOn());`
  when skipped, `console.warn("[reservation-notify] reservation_created email paused", { jobId: job.id })`
  and bypass the chain. Keying on kind alone is safe because only admins ever hold this kind.
- `notification-outbox.ts:651` — the completed stamp: `lastError: skipped ? "skipped:admin_email_paused" : null`.
  The job completes through the normal branch, the lease is released, the cron never retries. Nothing
  outside the outbox reads `lastError`/`status`; the cron's `completed` tally counts it.
- Untouched: hold-service, admin-actions, notification-queue, mirrors, kinds, dedupe keys.

**Tests.** Baseline on the branch: `notification-outbox`, `-recipients`, `-scheduling`,
`notification-queue`, `.light`, `mirrors/reservation-jobs`, `registry` → 7 files, 101 tests pass.
- `notification-outbox-recipients.test.ts`: `vi.mock("@/app/lib/feature_flags/data", () => ({ fetchFeatureFlagRule: flagRuleMock }))`;
  `describe("reservation_created")`: rule `hidden` → no send, `setCalls` ends with
  `{ status: "completed", lastError: "skipped:admin_email_paused" }`; `admin_only` → same; `public` → one
  send, subject "Nueva reserva creada", `lastError: null`. One `proof_submitted` admin case with rule
  `hidden` → still sends (other kinds untouched).
- `notification-outbox.test.ts` (`:49-52`, all cases use kind `reservation_created`): the same mock
  returning `public`, else the flag read hits the mocked `db` and logs noise.
- Unchanged and already covering the invariants: `mirrors/reservation-jobs.test.ts:110` (admin inbox
  copy), `registry.test.ts:335` (no push), `notification-queue*.test.ts` (dedupe).

**Verification.** `pnpm dev` with a local DB (`VERCEL_ENV=development` → `sendEmail` only logs). The
admin bell is gated by the `notifications` flag (`notifications/queries.ts:57`) — confirm it is at least
`admin_only`. As admin set the new card to **Oculta**; create a reservation as a participant: no "Sending
email" log, one paused line per admin; `reservation_notification_jobs` rows `completed` with the marker;
`notifications` rows `reservation_created_admin` per admin (not for an admin who created it via
admin-actions — the mirror skips the actor). Flip to **Pública**, repeat → emails return.

**Ops.** Deploy → global admin → `/dashboard/feature_flags` → "Correo a administración por reserva
creada" → **Oculta** (immediate; 300 s worst case). Flip back to **Pública** when the burst is over;
skipped jobs are never sent retroactively (intended).

**Risks.** "Oculta = email off" reads inverted next to the other flags and `admin_only` also means off —
the description says so. First flag with a `public` default, so a read failure fails *open* (= today).
Other admin kinds (`proof_submitted`, `zero_value_review_requested`, `settlement_approved`) are
deliberately out of scope.

---

## 5. Item 2 — "Reservado" legend entry and colour (effort S)

**What happens today.** `app/components/maps/map-utils.ts:101-102` paints `reserved` with
`rgba(91, 33, 182, 0.85)` (violet-800, comment "seleccionado"); hover `:121-122`, stroke `:141-142`,
text `#ffffff` at `:161-162`. `SELECTED_FILL` (`:175`) is `hsl(262, 77%, 49%)` — near-identical. These
four branches are the only ones hard-coded; every other status goes through `mapColor(name, light)`
(`:24-26`) with a `--map-<name>-*` override under `.dark {` (`globals.css:404`, block `:469-517`), so
`reserved` also has no dark treatment. The participant legend (`map-legend.tsx:1-30`) lists Disponible /
Seleccionado (`bg-primary`) / En espera / Ocupado (= `confirmed`) / Externo / No disponible — no
`reserved` row. Tonight every taken stand is `reserved` (`map-dto.ts:170-171` feeds `effectiveStatus` as
`status`), so the map fills with "Seleccionado"-coloured stands. "Reservado" is already the word used by
`stands/status-badge.tsx:4`, `stand-manage/shared.ts:4`, `admin-overview-stand-drawer.tsx:50`.

**Palette.** A rose tint structured like "En espera" (tint fill, strong stroke, dark text). Contrast on
the composited fill: light rose-300@0.7 over white → rose-900 text **6.1:1** (Ocupado 4.0, Disponible
6.3, En espera 5.2); hover rose-400@0.75 → 4.5:1 (borderline, hover only); dark
`rgb(244 63 94 / 0.32)` over `--card` → `#ffe4e6` **10:1**. Luminance: Reservado 0.62 vs Ocupado 0.82,
Disponible 0.81, En espera 0.72 — distinct in lightness, not only hue.

**Changes.**

- `map-utils.ts:101-102` → `mapColor("reserved-fill", "rgba(253, 164, 175, 0.7)") // rose-300 — reservado (pago pendiente)`;
  `:121-122` → `mapColor("reserved-hover", "rgba(251, 113, 133, 0.75)") // rose-400`;
  `:141-142` → `mapColor("reserved-stroke", "rgba(225, 29, 72, 0.85)") // rose-600`;
  `:161-162` → `mapColor("reserved-text", "#881337") // rose-900`. The same helpers feed `map-stand.tsx:70-77`,
  `map-stand-group.tsx:78-85` (a reserved full-table pair reads `group.stands[0].status`), the admin
  position editor `admin/draggable-map-stand.tsx:104,123,160` and the confirm thumbnail
  `hold-confirmation-client.tsx:139-147` — all wanted.
- `globals.css` after `:492` (`--map-taken-text`, inside `.dark`): `--map-reserved-fill: rgb(244 63 94 / 0.32); --map-reserved-hover: rgb(244 63 94 / 0.44); --map-reserved-stroke: rgb(251 113 133 / 0.9); --map-reserved-text: #ffe4e6;`
  (shape of `--map-overdue-*` at `:509-512`). Update the comment at `:472-474` — `reserved` is no longer a
  solid fill.
- `map-legend.tsx:11-15` — after "En espera": `{ label: "Reservado", color: "bg-rose-300/70 border-rose-600/80 dark:bg-(--map-reserved-fill) dark:border-(--map-reserved-stroke)" }`
  (the `bg-(--var)` form `:5` already uses). Order: Disponible, Seleccionado, En espera, Reservado,
  Ocupado, Externo, No disponible. `:34` `gap-2` → `gap-x-3 gap-y-1` (the legend shares a `justify-between`
  row with the 3×32 px toolbar).
- `stand-info-card.tsx:363` — `=== "held" ? "EN ESPERA" : stand.effectiveStatus === "reserved" ? "RESERVADO" : "OCUPADO"`.
  Optional `:360`: `red-50/600/950/400` → the `rose-*` equivalents.
- `confirmed` keeps "Ocupado"; the public and nav legends (which merge both into "Ocupado") are unchanged.

**Tests.** No test asserts the old value (`91, 33, 182`), the legend labels or the OCUPADO badge. Add
`app/components/maps/map-utils.test.ts` (`getStandFillColor("reserved", false)` ≠ `SELECTED_FILL`, ≠
`confirmed`, ≠ `available`; starts with `var(--map-reserved-fill,`; same for stroke/text) and
`app/components/maps/map-legend.test.tsx` (pattern `festival-nav-map-legend.test.tsx:9-27`; seven labels
in order). Extend `stand-info-card.test.tsx`: reserved → "RESERVADO", confirmed → "OCUPADO". Run-only:
`map-surface.test.tsx`, `festival-nav-map-legend.test.tsx`.

**Verification.** `pnpm exec vitest run app/components/maps app/components/festivals/reservations/stand-info-card.test.tsx`.
No story covers the maps; either add `app/components/maps/user/user-map.stories.tsx` (one stand per
status + `selectedStandId`, light and `.dark`) or screenshot the map on the dev DB with one stand per
status: reserved ≠ selected ≠ disponible; legend ≤ 3 rows at 360 px; dark via the theme toggle; check the
confirm thumbnail and the admin position editor.

**Risks.** Rose composites to almost the same colour as the admin overview's "Atrasado" red
(`admin-overview-map.tsx:59`); admins see rose = Reservado in the position editor and red = Atrasado in
the overview (previously the editor's violet collided with "Confirmado" instead). Participants never see
the overview. Accept; give the editor its own palette later. Deuteranopia: rose vs amber differ in
lightness and stroke weight — acceptable.

---

## 6. Item 3 — Start the hold clock after the locks (effort S)

**What happens today.** `createStandHold` (`hold-service.ts`, branch `:171-539`) samples
`const now = new Date()` at `:189` — before `db.transaction` (so before **pool checkout**, up to
`CONNECTION_TIMEOUT_MS = 75_000`, `db/index.ts:129`, with `DEFAULT_POOL_MAX = 5`) and before the
festival-wide locks (`:327-328`). It then feeds `reconcileExpiredHolds` (`:341`),
`denySelfServiceMutation` (`:367`), the `existingHold` read (`:419`), `releaseStandIfVacant` (`:449`),
`availableStandIds` (`:470`), `expiresAt` (`:487`) and `updatedAt` (`:519`). Three consequences:
every ms queued is subtracted from the participant's hold; a target-stand hold that expired *during* the
wait is still treated as live → spurious `STAND_UNAVAILABLE`; and the caller's own hold that expired
during the wait is replayed as `alreadyHeld` success pointing at a dead hold. The CHECK
`stand_holds_expires_after_created` (`drizzle/0247_open_zombie.sql:52`) compares against
`created_at DEFAULT now()` = transaction BEGIN time, which follows pool checkout, so it fails (→
`CONFLICT_RETRY`) only when the pool wait exceeds the hold length — rare but reachable with
`reservationHoldMinutes = 1`. Precedent: `comunicado_revisions.created_at` uses `clock_timestamp()`
because "an edit waits for a lock first" (`db/schema.ts:8010-8012`).

**Changes (all in `hold-service.ts`).**

- `:189` — rename to `const requestedAt = new Date();`. `:278` — `gt(standHolds.expiresAt, requestedAt)`
  in `existingHoldPreview` (pre-lock by design: it only widens the lock set; the decision is re-read at
  `:419`).
- `:335` — right after `lockHoldRows(...)` closes (`:334`) and before `reconcileExpiredHolds` (`:336`):
  `const now = new Date(); // the hold's clock starts once the festival locks are held; queue time is not the participant's`.
  Every use below keeps the name and picks up the fresh value.
- `:490-512` insert values — add `createdAt: now, updatedAt: now,` so the CHECK compares two app-clock
  values and `updatedAt ≥ createdAt` (both are existing columns; no reader of `standHolds.createdAt` in
  the reservation modules).
- Unchanged: the registry claim (`:204-229`), the idempotency key, `confirmStandHold` (`:721`/`:787`
  sample inline, `:834` lets tx-eligibility sample post-lock), `cancelStandHold`.
- Open window: `policy.ts:129` denies when `now < reservationsStartDate`; post-lock ≥ pre-lock, so the
  predicate is monotone — nobody allowed before is denied now; someone who tapped at 19:59:59 and got the
  lock after 20:00:00 is allowed. Do **not** use `select now()` in the tx (BEGIN time, same bug);
  `clock_timestamp()` would work but costs a round trip.

**Lock-set consistency (verified).** The preview over-includes holds live at `requestedAt`; they and
their stands are locked; reconcile deletes the expired ones under this transaction's own locks; same-user
writers are serialised by `lockParticipantsBeforeRegistryClaim` (`:199`). Nothing becomes live between
the two clocks.

**Tests.** Baseline: `hold-actions.test.ts` 12 + `hold-service.test.ts` 4 pass; neither asserts
`expiresAt`. Add to `hold-actions.test.ts` after `:324` (import `afterEach`; `afterEach(() => vi.useRealTimers())`):
*"starts the hold clock after the festival lock, not when the request arrived"* —
`vi.useFakeTimers({ now: T0 })`; `vi.mocked(lockFestivalTermsDocument).mockImplementation(async () => { vi.advanceTimersByTime(120_000); })`
(it is `mockReset` in `beforeEach`, so implement inside the test); selects in order
`[availableStand], [availableStand], [], [], [availableStand], [], [availableStand], [{ reservationHoldMinutes: 5 }]`
(standPreview, stand, existingHoldPreview, reconcile, freshStand, existingHold, currentStand,
festivalHold); `values = vi.fn(() => Object.assign(Promise.resolve([]), { returning: vi.fn().mockResolvedValue([{ id: 99 }]) }))`,
`insert: vi.fn(() => ({ values }))` (called twice: hold, then members);
`update: vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue([]) }) }))`. Assert
`values.mock.calls[0][0]` matches `{ expiresAt: new Date(T0 + 420_000), createdAt: new Date(T0 + 120_000) }`,
`denySelfServiceMock` called with `objectContaining({ now: new Date(T0 + 120_000) })`, result
`{ success: true, data: { holdId: 99 } }`. Run-only: `hold-service.test.ts`,
`hold-concurrency.integration.test.ts`. Optional integration case: after `seedEligibleFixture`,
`update(festivals).set({ reservationHoldMinutes: 1 })`; a second pool client holds
`pg_advisory_xact_lock(5822, hashtext(FESTIVAL_TERMS_DOCUMENT_SLUG))` for ~2 s; assert
`expiresAt − createdAt ≥ 60 s`.

**Risk.** Total held time per stand grows by queue length. `createdAt`/`updatedAt` become app-clock
values; harmless unless the DB and app clocks drift by more than the hold length.

---

## 7. Item 4 — Mark a lost stand taken at once; re-poll immediately (effort S–M)

**What happens today.** On the branch a lost race ends at `stand-info-card.tsx:315-317` with
`toast.error(res.message, { duration: 8000 })` and nothing else. `ClientMap` keeps `stands` in
`useState(initialStands)` (`client-map.tsx:57`) with no prop sync, so the only repaint is
`mergePolledStandStatuses` in the poll callback (`:90-97`) on a 4 s timer with no manual trigger. The
loser sees a free stand and an enabled button for up to 4 s and taps again. This is also the gap the
first document's Item 1 left open; **do not** add `router.refresh()` there (it re-renders the page and
would not repaint anyway, because `useState(initialStands)` ignores prop updates).

**Which failure codes mean "the stand is gone".** From `createStandHold` (branch `:171-539`):
`STAND_UNAVAILABLE` (`:436`, `:460`: the row is not `available` under `FOR UPDATE` after reconcile) is
authoritative → mark `held` locally + re-poll. `CONFLICT_RETRY` (`:211` claim conflict, `:223` replay
without ids, `:409` re-paired under lock, `:537` catch-all) is ambiguous → re-poll only. Everything else
(`STAND_NOT_FOUND`, `STAND_WRONG_FESTIVAL`, `STAND_NOT_ELIGIBLE`, `VALIDATION`, `UNAUTHENTICATED`, the
`denySelfServiceMutation` codes) is about the actor → toast only. `HOLD_EXPIRED`/`FULL_TABLE_*` are
confirm-time only. A companion that went is never a failure (`:463-473` silently degrades to a half-table
hold), so only the re-poll paints it. The viewer's own replay (`:211-230`, `:445-452`) returns success,
never `STAND_UNAVAILABLE`.

**Changes.**

- `app/hooks/use-stand-polling.ts` — add `pollNow`, coalesced to one in-flight + one queued. No
  `clearTimer()` before `poll()`: `poll()` reschedules on every completing path and `schedule()` clears
  the old timer; a stray tick mid-flight hits the `inFlightRef` guard (`:91`); `poll()`'s own
  `document.hidden` check (`:90`) makes a hidden `pollNow` a no-op.

  ```ts
  const pollNowRef = useRef<(() => void) | null>(null);
  const queuedRef = useRef(false);
  // inside the effect, after `poll` is defined; and in poll's existing finally (:130-134):
  //   if (trackerRef.current.isCurrent(token)) {
  //     inFlightRef.current = false;
  //     if (queuedRef.current && !cancelled) { queuedRef.current = false; void poll(); }
  //   }
  pollNowRef.current = () => {
    if (cancelled) return;
    if (inFlightRef.current) { queuedRef.current = true; return; }
    void poll();
  };
  // cleanup: pollNowRef.current = null; queuedRef.current = false;
  const pollNow = useCallback(() => pollNowRef.current?.(), []);
  return { stale, pollNow };
  ```

  Stale logic untouched (`armPendingStaleDeadline` per request). The server version is `Date.now()`
  (`route.ts:81`), so the manual result passes `isNewerPollVersion`. Rate limit 45/min vs 15/min baseline;
  the button disables after the local mark, so at most one extra request per lost race.
- `stand-info-card.tsx` — props (`:52-71`): add `onStandUnavailable?: (standIds: number[]) => void`
  (empty array = re-poll only). `takeStand` `else` (`:315-317`) and `catch` (`:318-320`); every take path
  funnels here (`handleSelectHalf :230`, `handleActivateAndSelect :257`, the fallback dialog `:563`):

  ```ts
  } else {
    if (res.code === "STAND_UNAVAILABLE") onStandUnavailable?.([stand.id]);
    else if (res.code === "CONFLICT_RETRY") onStandUnavailable?.([]);
    toast.error(res.message, { duration: 8000 });
  }
  } catch {
    onStandUnavailable?.([]); // the hold may exist server-side
    toast.error("No se pudo seleccionar el espacio", { duration: 8000 });
  }
  ```

  The card stays open: `stand` is derived from `stands` by id (`client-map.tsx:71-74`, `key` unchanged);
  `isOwnHold` is false → "EN ESPERA", "Otro participante está considerando…", disabled "Stand No
  Disponible"; `canStandBeReserved` reads `effectiveStatus` (`helpers.ts:31`).
- `client-map.tsx` (`:90-97`, `:171-190`):

  ```ts
  const { stale, pollNow } = useStandPolling(sectorId ?? null, 4000, …);
  const handleStandUnavailable = useCallback((standIds: number[]) => {
    setStands((prev) => mergePolledStandStatuses(prev,
      standIds.map((standId) => ({ standId, effectiveStatus: "held" as const, updatedAt: null }))));
    pollNow();
  }, [pollNow]);
  // <StandInfoCard … onStandUnavailable={handleStandUnavailable} />
  ```

  `mergePolledStandStatuses` (`status-poll.ts:79-98`) writes both `status` and `effectiveStatus` and
  returns `prev` for `[]`; `onAvailableCountChange` (`:64-68`) decrements at once.

**Tests.** Baseline on the branch: `client-map.test.tsx` 7, `stand-info-card.test.tsx` 5,
`use-stand-polling.test.ts` 6 — 18 pass. Constraints in `use-stand-polling.test.ts` that must keep
holding: `:36-70` no overlapping fetch, `:72-93` version ordering, `:95-121` backoff, `:123-186` stale
timing, `:188-202` abort on unmount. Add: `pollNow` fetches once and the next timer poll is 4000 ms
later; two `pollNow` during an in-flight fetch → one extra fetch after it resolves; after unmount → none;
`document.hidden` → none; identity stable across re-renders. `client-map.test.tsx`: the
`use-stand-polling` mock (`:27-36`) must return `{ stale: false, pollNow }` with a hoisted `vi.fn()`, and
the `stand()` fixture defaults to `held` (`:71-72`) — override to `available` and mock `createStandHold`;
cases: `STAND_UNAVAILABLE` on A1 → "Otro participante está considerando", `pollNow` once, A2 unchanged
until the captured poll callback delivers; `CONFLICT_RETRY` → `pollNow` once, A1 still reservable.
`stand-info-card.test.tsx` (extend "keeps a lost race on screen", `:165-182`): `onStandUnavailable`
with `[21]` / `[]` / not called for `STAND_NOT_ELIGIBLE` / `[]` on a rejected `createStandHold`.

**Verification.** Two accounts race for one stand: the loser gets the toast, the stand turns amber and
the card flips to "Stand No Disponible" in the same frame, one `GET /api/stands/status` fires at once.
Full table: the tapped half amber immediately, the companion after the manual poll.

**Risks.** A stand that went `reserved`/`confirmed`/`disabled` shows "EN ESPERA" for one poll (then the
poll overwrites it — the poll returns every stand in the sector). Pre-existing and out of scope: an effect
re-run replaces `trackerRef` with a fresh `LatestRequest` (`:53`), so an old token can collide in
`finally`; the `!cancelled` guard keeps the drain safe.

---

## 8. Item 5 — Server-driven countdown; never cancel from the phone's clock (effort S)

**What happens today.** `hold-confirmation-client.tsx:286-338` seeds `remainingSeconds` from
`Date.now()`, ticks on the phone clock, and at 0 calls `cancelStandHold(hold.id)` — which deletes the row
with **no `expiresAt` guard** (`hold-service.ts:541-621`: owner check, aggregate lock, `tx.delete`,
`releaseStandIfVacant`). A phone 5 min fast destroys a valid hold on load; 1 min fast silently loses a
minute. On a full-page load (reload, PWA relaunch, shared link) the component is SSR'd (route
`<Suspense>` → `hold-confirmation.tsx:88-99` → client component; no `ssr: false` on the chain) and the
clock-derived text and the `remainingSeconds <= 30` classNames (`:487,:497`) mismatch on hydration; the
normal path (`router.replace` from the map) is a client render and does not hydrate. The server never
needs the phone: confirm checks `gt(expiresAt, now)` (`:721,:787`) and returns `HOLD_EXPIRED`; the poll
(`status-service.ts:55-62` + `effective-status.ts:10-11`), the map DTO (`map-queries.ts:371`),
`standHasLiveOccupancy` and `availableStandIds` all derive from `expiresAt > now`; `createStandHold`
reconciles by stand or by (user, festival) (`:140-168`), so a lingering expired row never blocks the next
hold; `cleanupExpiredHolds` runs every minute. Only this component cancels on a timer. The festival
default hold is **5 minutes** (`HOLD_DURATION_MINUTES = 5`, `schema.ts:398-400`, allowed 1–30); the PRD's
"3 min" at `docs/PRD-stand-reservations.md:161` is stale.

**Changes.**

- `app/lib/reservations/dto.ts:209` — `hold: { id: number; expiresAt: string; serverNow: string }`.
- `app/lib/reservations/map-queries.ts:763` — `hold: { id, expiresAt: hold.expiresAt.toISOString(), serverNow: now.toISOString() }`
  (the `now` of `:603`, the same instant as the `expiresAt <= now` check at `:674`, so the client can
  never show time the server already denied).
- `hold-confirmation-client.tsx:77` — add `serverNow: string` to the `hold` prop type.
- New `app/components/festivals/reservations/use-hold-countdown.ts` (beside the component; pure helper
  exported for tests):

  ```ts
  export function remainingSecondsAt(expiresAtMs: number, nowMs: number) {
    return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000)); // 0:00 means expired
  }
  export function useHoldCountdown(expiresAt: string, serverNow: string) {
    const expiresAtMs = Date.parse(expiresAt);
    const serverNowMs = Date.parse(serverNow);
    // Same on server and client: the first render shows what the server saw (cf. app/hooks/use-now.ts).
    const [remaining, setRemaining] = useState(() => remainingSecondsAt(expiresAtMs, serverNowMs));
    useEffect(() => {
      const offsetMs = serverNowMs - Date.now(); // phone skew, measured once
      const tick = () => remainingSecondsAt(expiresAtMs, Date.now() + offsetMs);
      const first = tick(); setRemaining(first);
      if (first === 0) return;
      const timer = setInterval(() => { const next = tick(); setRemaining(next); if (next === 0) clearInterval(timer); }, 1000);
      const onVisible = () => { if (document.visibilityState === "visible") setRemaining(tick()); };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", onVisible);
      return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
    }, [expiresAtMs, serverNowMs]);
    return remaining;
  }
  ```

  Replace `:285-305` with `const remainingSeconds = useHoldCountdown(hold.expiresAt, hold.serverNow);`.
  Precedent for visibility + focus recheck: `impersonation-banner.tsx:134-154`.
- `:307-338` — the expiry effect becomes:

  ```ts
  const leftRef = useRef(false); // set before every router.replace in this component
  useEffect(() => {
    if (remainingSeconds !== 0 || isSubmitting || leftRef.current) return;
    leftRef.current = true;
    toast.info("Tu reserva temporal expiró", { duration: 8000 });
    router.replace(mapUrl);
  }, [remainingSeconds, isSubmitting, router, mapUrl]);
  ```

  No server round trip at 0: the row is already invisible to every reader and the cron removes it within
  60 s. Set `leftRef.current = true` in `goToMap` (`:437`), `handleCancel` success (`:416`) and both
  `handleConfirm` navigations (`:381-383`, `:392`) — it also guards the (unconfirmed) race where the
  expiry effect could `replace(mapUrl)` over the payments navigation after a successful confirm. Keep the
  `cancelStandHold` import (used by `handleCancel` / "Liberar").
- `docs/PRD-stand-reservations.md:28,:70,:101` — expiry is the server's; the client shows the notice and
  returns to the map. `:161` — `created_at + reservationHoldMinutes` (default 5), not 3.

**Overlap.** The first document's Item 5 landed (`mapUrl :224`, `goToMap`/`useScreenBack :437-440`,
AlertDialog, 8 s toasts); this edits the countdown block below them. Item 4's `OpensAtRefresh` already
takes `serverNow` — same convention. Item 2's poll-time prune in `client-map.tsx` still uses the phone
clock, but it only hides card state. §9 edits `handleConfirm`'s failure branches; the `leftRef` writes
go on its two `router.replace` lines only.

**Tests.** Extend `hold-confirmation-client.test.tsx` (`renderConfirm` at `:51` gains `expiresAt`/`serverNow`;
`vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })`;
drive with `act(() => vi.advanceTimersByTime(…))`, not `waitFor`). 1. Phone 5 min ahead, 3 min left →
renders "3:00", `cancelStandHold` never called; +180 s → "0:00". 2. At 0: `toast.info(…, { duration: 8000 })`,
`replace(MAP_URL)` exactly once, `cancelStandHold` never. 3. Hidden tab (stub `document.visibilityState`,
delete in `afterEach`), advance 4 min, dispatch `visibilitychange` → "0:00" and one `replace`. 4. Confirm
pending at 0 → no `replace`; resolve success → exactly one `replace(…/payments)`. 5. Hydration:
`renderToString` (pattern `screen-bar.hydration.test.tsx`, `ScreenBarProvider`, `usePathname` mocked)
with `serverNow` 3 min before `expiresAt` and fake system time 5 min later contains `3:00`;
`hydrateRoot(…, { onRecoverableError: spy })` → not called. 6. `remainingSecondsAt` edges (negative,
fractional → ceil, NaN). 7. `full-table.integration.test.ts:740,:772` call
`fetchFestivalReservationConfirmationDto` — pass `now` and assert `confirmation.hold.serverNow === now.toISOString()`.

**Verification.** `tsc`; `pnpm exec vitest run app/components/festivals/reservations app/lib/reservations/map-dto.test.ts`;
integration. Phone with the clock set +3 min: the confirm screen shows ~5:00 (today it shows 0:00 and
deletes the hold); hard reload → no hydration error in the console; background 4 min → "expiró" and the
map; tap Confirmar at 0:02 → payments, no bounce.

**Risks.** `serverNow` is captured before the DB round trips and streaming, so the phone reaches 0 after
the server by the server + delivery time; a confirm in that window gets `HOLD_EXPIRED` → existing toast +
map path (safe direction). An NTP jump mid-countdown shifts the display until the next load. The row and
`stands.status = held` linger ≤ 60 s; every live-hold reader derives status, so other participants are
unaffected.

---

## 9. Item 6 — Stay on the confirm screen with "Reintentar" on `CONFLICT_RETRY` (effort S)

**What happens today.** `confirmStandHold`'s catch-all (`hold-service.ts:1087-1089`) maps every throw —
the three deliberate `throw new Error("…_conflict")` at `:982/:1019/:1040` and any DB timeout, pool or
lock error — to `CONFLICT_RETRY`, and the client's else-branch (`hold-confirmation-client.tsx:390-393`)
answers with `toast.info` + `router.replace(mapUrl)`. On a thrown error the transaction rolled back
(including the registry claim), so the hold is still alive; sending the participant to the map loses the
countdown for nothing. A retry on the same idempotency key is safe: the registry row is locked
`FOR UPDATE` after `lockParticipantsBeforeRegistryClaim` (`:640-648`), so a second request blocks until
the first ends and then sees `completed` → replay (`request-registry.ts:103-108`, `hold-service.ts:660-667`
return `reservationSuccess({ reservationId }, "Ya tenés una reserva vigente…")`) or no row (rolled back or
`abandonRequest`, which deletes, `:180-184`) → fresh claim. A genuinely lost stand comes back as
`STAND_UNAVAILABLE` / `HOLD_EXPIRED`, which still navigate. **Some `CONFLICT_RETRY`s are deterministic**
(`:889` full table without access, `:929` missing full-table price, `:660-663` replay without a numeric
`reservationId`), so retries must be capped.

**Changes (all in `hold-confirmation-client.tsx`).**

- `handleConfirm` (`:355-398`): add `const [confirmError, setConfirmError] = useState<string | null>(null)`
  and `const retryCountRef = useRef(0)`. Call `setConfirmError(null)` synchronously before
  `startSubmitTransition`. Mapping: success → unchanged, plus `retryCountRef.current = 0`;
  `PARTNER_NOT_ELIGIBLE` / `PARTNER_ALREADY_RESERVED` → unchanged (stay, toast); **`CONFLICT_RETRY` and
  the `catch`** → if `++retryCountRef.current >= 3`:
  `toast.info(RESERVATION_ERROR_MESSAGES.CONFLICT_RETRY, { duration: 8000 }); router.replace(mapUrl);`
  else `setConfirmError("No pudimos confirmar tu reserva. Tu espacio sigue en espera: intentá de nuevo.")`
  (own copy — `errors.ts:99-100` says "Actualizá", wrong advice here; leave `errors.ts` alone); every
  other code (`HOLD_EXPIRED`, `STAND_UNAVAILABLE`, `STAND_WRONG_FESTIVAL`, `FULL_TABLE_HOLD_SPLIT`,
  `ALREADY_RESERVED`, `VALIDATION`, auth/policy) → unchanged (`toast.info` 8000 + `replace(mapUrl)`).
- `confirmIntentKeyRef` (`:353`, one UUID per mount): keep it, and add `lastAttemptPartnerRef`; at click
  time, if `selectedPartnerId !== lastAttemptPartnerRef.current`, mint a new UUID and reset
  `retryCountRef`. The registry scope is `{ holdId, partnerId }` (`:656`), so a retry must resend the
  same partner or `claimRequest` returns `conflict`.
- Footer (`:584-604`), inside the sticky wrapper above the button row:
  `{confirmError && <Alert variant="destructive"><AlertCircleIcon className="h-4 w-4" /><AlertDescription>{confirmError} <Button type="button" size="sm" variant="link" onClick={handleConfirm} disabled={isSubmitting || isExpired}>Reintentar</Button></AlertDescription></Alert>}`
  — `Alert`/`AlertDescription` from `@/app/components/ui/alert` (`role="alert"`), `AlertCircleIcon`
  from lucide; pattern `organisms/orders/admin-adjust-order-form.tsx:182-195`. `isExpired` exists
  (`:444`). "Confirmar Reserva" stays enabled (same handler, same key).
- `:577` — `onSelectPartner={(id) => { setSelectedPartnerId(id); setConfirmError(null); }}`.
- Expiry effect: no change beyond §8 (`isSubmitting` in its deps already defers expiry during a retry).
- Server: keep `CONFLICT_RETRY` at `:1087-1089`; optionally log `{ holdId, idempotencyKey }`. Do not add
  a new code. `createStandHold`'s catch (`:535-537`), `cancelStandHold` (`:616-618`), `hold-actions.ts`
  and `stand-info-card.tsx` (failure only toasts; the user is already on the map) are unchanged.

**Tests.** Baseline: `hold-confirmation-client.test.tsx` + `hold-actions.test.ts` → 19 pass. Extend the
client test: `CONFLICT_RETRY` → `getByRole("alert")` has the copy, `replace`/`toast.info`/`toast.error`
not called, "Confirmar Reserva" enabled; "Reintentar" → `confirmStandHold` called twice with the **same**
`idempotencyKey` and `holdId`; second call success → `replace(…/payments)`, alert gone;
`mockRejectedValueOnce(new Error())` → same alert; third consecutive `CONFLICT_RETRY` → `toast.info` +
`replace(MAP_URL)`; partner change (re-mock `PartnerSelection`, currently `() => null` at `:38-41`, with a
button calling `onSelectPartner(4)`) → next call uses a different key and `partnerId: 4`;
`HOLD_EXPIRED`/`STAND_UNAVAILABLE` still `replace(MAP_URL)` (keep `:186-201`). Optional in
`hold-actions.test.ts`: `transactionMock.mockRejectedValueOnce(new Error("timeout"))` → `CONFLICT_RETRY`.
Run-only: `hold-service.test.ts`; integration `prd-unblockers`, `full-table`, `pricing-snapshots`,
`hold-concurrency`, `request-registry`.

**Verification.** `tsc`; eslint; the two unit files. Locally `throw new Error("forced")` just before the
`standReservations` insert (`:936`): confirm → inline alert, countdown keeps running, URL unchanged;
remove the throw, "Reintentar" → payments. Replay: throw inside `scheduleReservationNotificationJobs`
(inside the `try`, `:1083`) → the first click commits, the alert shows; "Reintentar" replays the same
`reservationId`, no second row (the toast reads "Ya tenés una reserva vigente…"). Three forced failures →
map. Timer reaches 0 while the alert shows → "expiró", map.

**Risks.** Committed-but-lost response, then a partner change → fresh key → the hold row is gone
(`:991`) → `HOLD_EXPIRED` (`:731-741`) → map, where `ALREADY_RESERVED` takes over — accepted. A replay
re-fires confetti and PostHog `RESERVATION_CONFIRMED` (pre-existing).

---

## 10. Deliberately unchanged

- `RESERVATION_ERROR_MESSAGES` (shared by ~80 call sites).
- Admin email for `proof_submitted`, `zero_value_review_requested`, `settlement_approved`.
- The festival-wide `FOR UPDATE` + global advisory lock (throughput ceiling; its own PR).
- `cancelStandHold` itself (it stays unguarded; only its caller at countdown 0 is removed).
- The public and nav map legends.

## 11. Verification commands

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"   # skip if that path does not exist
pnpm exec tsc --noEmit
pnpm exec eslint <touched files>
pnpm exec vitest run                                        # whole unit suite at the end
```

Integration (disposable Postgres; never `.env.local`'s `POSTGRES_URL`):

```bash
export GLITTER_TEST_DB_PORT=55432
pnpm db:test:up && pnpm migrate:test && pnpm test:integration
```

Without Docker, the local-cluster recipe in `IMPLEMENTATION-reservation-flow-launch-fixes.md` §12 works.
Phone checks are listed per item (Items 4, 5 and 6 need two accounts and a phone with a skewed clock).

## 12. Acceptance criteria

1. With the flag **Oculta**, a new reservation creates the admin inbox items and `completed` jobs with
   the `skipped:admin_email_paused` marker and sends no admin email; with **Pública**, emails send as
   before. The participant's own emails are unaffected.
2. A `reserved` stand draws rose with a "Reservado" legend entry; the card badge reads RESERVADO;
   `confirmed` still reads Ocupado; dark mode has its own values.
3. `expires_at − created_at` equals the festival's hold minutes regardless of how long the request waited
   for the pool or the festival lock; the open-window and sanction checks use the post-lock clock.
4. Losing a race marks the stand "En espera" and disables the button in the same frame and fires one
   immediate status poll; the next poll overwrites the local mark.
5. The confirm countdown is correct on a phone whose clock is skewed by minutes; reaching 0 never calls
   `cancelStandHold`; a hard reload of the confirm screen produces no hydration error.
6. `CONFLICT_RETRY` (or a thrown confirm) shows an inline "Reintentar" without leaving the screen; the
   retry reuses the idempotency key; the third consecutive failure falls back to the map.
7. `tsc`, the full unit suite and the integration suite pass.

## 13. Deferred follow-ups

- Admin digest for `reservation_created` instead of a pause; the same switch for the other admin kinds.
- A `serverNow` on `ReservationActiveHoldDto` so the map's poll-time prune stops using the phone clock.
- A distinct palette for the admin position editor (rose currently collides with the overview's
  "Atrasado").
- "Tenés un espacio en espera — continuar" banner on the map (the sector tabs open the first sector
  with availability, not the held stand's).
- Everything in `IMPLEMENTATION-reservation-flow-launch-fixes.md` §14 (hardening, native-feel
  navigation, mobile polish).
