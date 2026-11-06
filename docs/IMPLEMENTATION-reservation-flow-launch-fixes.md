# Implementation: Reservation flow — launch-day fixes (installed app)

**Product:** Glitter
**Date:** 2026-11-06
**Status:** Specified, ready to implement
**Target:** Next.js 16.4.2 App Router, React 19 (React Compiler on), PostgreSQL/Drizzle, Tailwind v4, installed PWA

---

## 1. Decision

Seven small, independent changes to the participant stand-reservation flow, chosen because each one
removes a server round trip, a wasted server render, or a friction point on a phone, and none needs a
schema change or a design decision. Stand reservations open **tonight at 20:00 America/La_Paz**; every
item here is safe to ship before that and can be cut at any point in the order below.

Implement in this order. Each item is its own commit; run the listed tests after each.

| # | Item | Effort | Spec |
| - | ---- | ------ | ---- |
| 1 | Remove `guardedRevalidate()` from the hold/confirm/cancel actions | S | §4 |
| 2 | Drop the mount-time `getActiveHold` server action in the client map | S | §5 |
| 3 | Light profile (`getCurrentBaseProfile`) on the reservation hot paths | M | §6 |
| 4 | Auto-refresh the "not open yet" screens at `reservationsStartDate` | S | §7 |
| 5 | Mobile / installed-app fixes on the map and confirm screens | M | §8 |
| 6 | Parallelise the map / confirm / entry waterfalls | M | §9 |
| 7 | Real `loading.tsx` skeletons for `intro` and `payments` | S | §10 |

Every spec below was written from the code at `origin/main` `8fae3971` and then checked by a second
reviewer who opened each cited file and tried to break the spec. §8 (mobile) did **not** get that second
pass — treat its line numbers as approximate and re-verify them. Line numbers everywhere are hints, not
contracts: open the file.

## 2. Why: where the seconds go

Participants are in Bolivia; Vercel (`iad1`) and the Railway database are both in Virginia. The DB leg is
~1–2 ms, the phone leg is ~130–160 ms per round trip. Each step of the flow pays **several sequential
phone→server round trips plus server-side query waterfalls**:

| Step | Today | Round trips the phone waits for |
| ---- | ----- | ------------------------------- |
| Tap stand → confirm screen | `createStandHold` action (heavy 7-relation profile query + ~25 locked statements) → **`revalidatePath` makes the action response carry a full re-render of the map page** → `router.replace(confirm)` → confirm page renders: profile → protect → denial check (5 sequential queries) → confirmation DTO (7 sequential queries) | 2 trips + ~15 sequential queries + 1 wasted page render |
| Confirm → payments | `confirmStandHold` → revalidate re-renders the confirm page → `router.replace(payments)` → profile ∥ festival → invoices → per-invoice tender | 2 trips + 1 wasted render; generic skeleton |
| Cancel / expiry → map | tx → confirm re-render → full map render (~20 queries, duplicate `fetchFullTableOffer`) | 2 trips + 1 wasted render |
| Sector tab switch | client-only, but `ClientMap` remounts and fires `getActiveHold` (heavy profile) | 1 avoidable trip |
| Every 4 s per device | `/api/stands/status` runs the full profile query + enrollment + rate-limit write | background load |

Verified facts the specs rely on:

- `next.config.ts` sets neither `experimental.staleTimes` nor `cacheComponents`; the client router cache
  for dynamic pages is 0 s (`node_modules/next/dist/docs/.../staleTimes.md:27-28`). `<Link>` prefetch on
  these routes carries only the layout down to the first `loading.tsx`.
- `revalidatePath` inside a Server Function sets `pathWasRevalidated`, which makes the action handler
  render the current page into the action response (`revalidate.js:182-185`, note the
  "TODO: only revalidate if the path matches"; `action-handler.js:947-960`), and the docs say so
  (`revalidatePath.md:19`).
- The root layout's Navbar is a shared layout and is **not** re-rendered on client navigation; the
  installed-app chrome is not the problem.
- `public/sw.js` has no fetch handler and is served `no-store`, so standalone mode fetches RSC and
  actions exactly like the browser; nothing here differs between web and PWA.

## 3. Goals, non-goals, conventions

**Goals.** Fewer round trips and fewer wasted renders per interaction; the 20:00 flip without a manual
reload; no accidental hold release in the installed app; buttons clear of the iPhone home indicator.

**Non-goals (deliberately out of scope, see §13).** Confirm-in-a-sheet over the mounted map, the hub
festival mega-query, `staleTimes`, Cache Components, the festival-wide lock, any schema or migration.

**Conventions.**

- Spanish copy in voseo. Money/date formatting through `app/lib/formatters.ts` (times render as
  "8:00 PM" in America/La_Paz).
- Node ≥ 24 (`export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` if the shell shows 22).
- Unit tests: `pnpm exec vitest run <paths>`. Type check: `pnpm exec tsc --noEmit` (there is no
  `typecheck` script; `tsconfig` excludes test files and has no `noUnusedLocals`, so run eslint on
  touched files to catch orphaned imports). Integration tests: see §12.
- Never run `pnpm migrate` or `pnpm seed` against an unresolved `POSTGRES_URL` (AGENTS.md). Nothing in
  this document needs a migration.
- Conventional Commits, one commit per item.

---

## 4. Item 1 — Remove `guardedRevalidate()` (effort S)

**Problem.** `app/lib/reservations/hold-service.ts:79-86` defines `guardedRevalidate()` →
`revalidatePath("/profiles")` + `revalidatePath("/my_profile")`, called at `:559` (createStandHold),
`:641` (cancelStandHold), `:1101`, `:1113`, `:1119` (confirmStandHold). Any `revalidatePath` in a
Server Function makes the action response carry a full render of the current page, which the client
throws away because every success branch immediately `router.replace()`s elsewhere
(`stand-info-card.tsx:284,:292`; `hold-confirmation-client.tsx:308,:369,:380,:404`). The literal paths
match nothing: `/profiles` has no `page.tsx` (only `[profileId]/...`), and pages carry only their own
layout/page/pathname tags. Dynamic pages have a 0 s client cache anyway.

**Changes.**

- `hold-service.ts:73` — delete `import { revalidatePath } from "next/cache";`.
- `hold-service.ts:79-87` — delete the helper and the blank line after it.
- `:559-560` → `return result;` (createStandHold).
- `:641-642` → `return outcome;` (cancelStandHold).
- `:1100-1103` → `if (!result.success) return result;`.
- `:1112-1115` → `if (reservationId == null) return reservationFailure("CONFLICT_RETRY");`.
- `:1116-1120` — keep `scheduleReservationNotificationJobs(...)` (post-commit outbox dispatch), drop only
  the `guardedRevalidate()` line.
- `grep -n "revalidatePath\|guardedRevalidate\|next/cache" app/lib/reservations/hold-service.ts` must
  print nothing afterwards.
- **Leave every other `revalidatePath` in the wider flow untouched** (`reservations/actions.ts:148,211`,
  `full-table-actions.ts:48,107-109,137-139`, `late-partner-actions.ts`, `stand-change-actions.ts`,
  `release-actions.ts`, `payment-service.ts` (many), `admin-service.ts`, `admin-actions.ts`,
  `capacity-service.ts`, `app/lib/stands/*-actions.ts`). Their client callers rely on the in-place
  re-render (several call `router.refresh()` themselves). Auditing them is a follow-up.

**Behaviour change to know about.** `guardedRevalidate()` at `:559` ran for *failed* holds too
(`STAND_UNAVAILABLE`, `CONFLICT_RETRY`, …), and `stand-info-card.tsx:296-298` only toasts on failure, so
today the map repaints "taken" straight from the action response after a lost race. After this change it
repaints on the next 4 s poll tick (`client-map.tsx:110`). Acceptable; if stale maps after a lost race are
reported, add `router.refresh()` in that failure branch (failures only). **Do not restore
`revalidatePath`.** Same for `PARTNER_NOT_ELIGIBLE` / `PARTNER_ALREADY_RESERVED` on the confirm page
(`hold-confirmation-client.tsx:372-378` stays on the page; nothing it needs comes from the re-render).

**Tests.**

- `app/lib/reservations/hold-service.test.ts` (mocks `next/cache` at `:57-59`, never asserts on it) and
  `app/lib/stands/hold-actions.test.ts` (`:78-80`): no assertion changes. The `next/cache` mocks may be
  deleted — the module graph still reaches `next/cache` through
  `credits/service → festivals/feature-config → stands/full-table-pairs → stands/helpers →
  api/stands/definitions → api/reservations/definitions → data/invoices/definitions →
  api/stands/actions.ts:20 / data/tickets/actions.ts:4`, and the real `next/cache` imports cleanly under
  the jsdom config (proven by `app/components/maps/map-participants.test.ts`). Keep the mocks in the
  integration suites.
- Run-only: `hold-concurrency`, `prd-unblockers`, `pricing-snapshots`, `full-table`,
  `credits/feature-top-up` integration tests (all import hold-service; all keep their `next/cache` mock).
- Do **not** add a "revalidatePath not called" test; it would re-couple the service to `next/cache`.

**Verification.** `tsc`, eslint on the three files, the two unit suites, the integration list above. In
DevTools, the confirm action POST body should contain only the action result (no page flight tree). The
`x-action-revalidated` header can still appear when Clerk refreshed a cookie during the request — judge
by the body. Lost-race check with two accounts: the loser gets the "no disponible" toast and the stand
flips within ~4 s.

---

## 5. Item 2 — Drop the mount-time `getActiveHold` in the client map (effort S)

**Problem.** `app/components/festivals/client-map.tsx:92-106` fires the `getActiveHold` server action on
every mount, and `map-tabs-client.tsx:93-121` remounts `ClientMap` on every sector tab, so each tab switch
costs a round trip that also runs the heavy profile query. Its result `{ id, standId }`
(`hold-service.ts:150-163`) overwrites the DTO's `ReservationActiveHoldDto` (`dto.ts:146-153`, which has
`standIds` for a full table, populated at `map-queries.ts:566-578`), so a participant holding a full
table sees their own second half as "Otro participante está considerando este espacio"
(`stand-info-card.tsx:43-47` `heldByViewer`, `:396-403`). The map DTO is rebuilt on every arrival at
`/reservations/new` and the 4 s poll keeps every stand's held/available status fresh.

**Changes.**

- `client-map.tsx:23` — delete `import { getActiveHold } from "@/app/lib/stands/hold-actions";`.
- `client-map.tsx:92-106` — delete the whole effect. `activeHold` keeps its initial value
  (`initialActiveHold ?? null`, from `map.activeHold` via `map-tabs-client.tsx:104`) and changes only
  through `handleHoldChange` and the prune below. No `profile` null-guard is needed (the prop is required).
- `client-map.tsx:108-110` — prune an expired own hold on every poll result (replaces the one thing the
  mount fetch bought: re-checking ownership on tab switch):

  ```ts
  const { stale } = useStandPolling(sectorId ?? null, 4000, (result) => {
    setStands((prev) => mergePolledStandStatuses(prev, result.stands));
    setActiveHold((hold) =>
      hold && "expiresAt" in hold && Date.parse(hold.expiresAt) <= Date.now() ? null : hold,
    );
  });
  ```

  Runs in an event callback, safe under the React Compiler. When it flips to null,
  `stand-info-card.tsx:186-196` already expires the cached hold-intent key.
- Types: make `standIds` required on the local hold union in both `client-map.tsx:27-30` and
  `stand-info-card.tsx:31-34` (or export one `ActiveHold` type from stand-info-card and import it), and
  simplify `heldByViewer` to `hold.standId === standId || hold.standIds.includes(standId)`. Minimal
  fallback: leave the unions and the `"standIds" in hold` guard as they are.
- `stand-info-card.tsx:289-294` — report every stand the server actually took, from the **server's**
  answer (`res.data.isFullTable`, returned by `createStandHold`, `hold-service.ts:547-556`), never from
  `fullTableSelection.kind` (presentation-only):

  ```ts
  const heldStandIds =
    res.data.isFullTable && stand.standGroupId != null
      ? [...new Set([stand.id, ...(sectorStands ?? []).filter((s) => s.standGroupId === stand.standGroupId).map((s) => s.id)])]
      : [stand.id];
  onHoldChange?.({ id: res.data.holdId, standId: stand.id, standIds: heldStandIds });
  ```

- `app/lib/stands/hold-actions.ts` — delete the `getActiveHold` export (`:37-43`), the
  `getActiveHoldService` alias import (`:7`), the now-unused `parseUnknown` / `positiveIntSchema` names
  from the schemas import (keep `parseConfirmHoldInput`, `ConfirmStandHoldInput`), and the
  `getCurrentUserProfile` import (`:16`). Removing an exported `"use server"` function removes a public
  endpoint; no caller remains (`grep -rn getActiveHold app docs` → nothing).
- `app/lib/reservations/hold-service.ts:150-163` — delete the service function. Keep the drizzle import
  (`gt` is still used at `:303,:444,:748,:814`).
- `docs/PRD-stand-reservations.md:302-313` — remove the `getActiveHold(userId, festivalId)` subsection
  or replace it with one sentence: the client reads the hold from `FestivalReservationMapDto.activeHold`
  (`id, standId, standIds, expiresAt`); the status poll plus `expiresAt` keep it fresh.
- `app/components/pages/profiles/festivals/sector-reservation.tsx` also renders `ClientMap` but has no
  importer (the `sectors/[sectorId]` route is a bare redirect) — leave it.

**Tests.**

- Run-only: `hold-actions.test.ts`, `hold-service.test.ts`, `use-stand-polling.test.ts`,
  `status-poll.test.ts`, `api/stands/status/route.test.ts`.
- Add to `map-dto.test.ts`: `sampleDto({ activeHold: { id: 20, standId: 21, standIds: [21, 22], expiresAt: now } })`
  serialises `expiresAt` to ISO and keeps `standIds`.
- Add `app/components/festivals/client-map.test.tsx` (jsdom; pattern `full-table-panel.test.tsx:1-19`).
  Mock `server-only`, `@/app/lib/stands/hold-actions` (only `createStandHold` — any surviving
  `getActiveHold` call throws), `@/app/lib/reservations/full-table-actions`, `sonner`,
  `next/navigation`, `@/app/hooks/use-stand-polling` (`{ stale: false }`), and
  `@/app/components/maps/user/user-map` with a stub that renders one button per stand. Pass
  `sectorName` (the card only renders when it is non-null, `client-map.tsx:151`). Cases: own full-table
  hold → tapping the companion shows "Tenés este espacio reservado temporalmente", not
  "Otro participante"; `activeHold={null}` → "Otro participante está considerando"; no server action
  fires on mount; optional: poll callback with a past `expiresAt` prunes the hold.
- Add `stand-info-card.test.tsx` if the payload change is made: `createStandHold` resolving
  `{ success: true, data: { holdId: 5, isFullTable: true } }` → `onHoldChange` called with both ids.

**Verification.** `grep -rn getActiveHold app docs` empty; `tsc`; eslint on the four files; DevTools: switching
sector tabs fires zero `Next-Action` POSTs, only `GET /api/stands/status`. Full-table check: activate,
"Seleccionar mesa completa", land on `/confirm/{holdId}`, open the map URL fresh (do **not** use back —
until Item 5 lands, back cancels the hold) → tapping either half shows "Continuar con tu reserva".

**Risk.** A hold created on another device while this map is open shows as "Otro participante" until a
navigation; today's mount fetch only helped on the next tab switch, so the window is small.

---

## 6. Item 3 — Light profile on the hot paths (effort M)

**Problem.** `getCurrentUserProfile` (`app/lib/users/helpers.ts:19-33`) →
`cachedFetchUserProfileByClerkId` (`users/queries.ts:44-87`) is one relational query with five nested
lateral subqueries (`userRequests`, `userSocials`, `participations → reservation → stand/festival →
festivalDates`, `profileTags → tag`, `profileSubcategories → subcategory`). React `cache()` dedupes it
only within one render pass, so it runs again in **every server action and route handler** — including
the 4 s stand-status poll. `getCurrentBaseProfile` (`helpers.ts:35-48`) returns the single `users` row
(`BaseProfile = typeof users.$inferSelect`) by the unique `clerk_id`. Both resolve the viewer through
`getViewerClerkId`, so impersonation semantics are identical.

**Changes — pure wins (server actions / route handlers; ship these first):**

- `app/api/stands/status/route.ts:15,24` → `getCurrentBaseProfile`. Uses `actor.id/role/status` only
  (`authorizeStandStatusPoll` takes `{ id, role, status }`).
- `app/lib/stands/hold-actions.ts` — after Item 2 only `confirmStandHold`/`createStandHold`/`cancelStandHold`
  wrappers remain; they resolve nothing themselves. (If Item 2 is skipped: `:38` `getActiveHold` →
  `getCurrentBaseProfile`, only `actor.id` is used.)
- `app/lib/reservations/hold-service.ts:59, 88-92` `requireSelfServiceActor` → `getCurrentBaseProfile`.
  Verified every `actor` use in the file: `actor.id`, `actor.role` (always narrowed to
  `{ id, role }` for `ReservationActor`), `actor.category` (`:313,:910` → `isFullTableCategory`). The
  object is never passed whole; `denySelfServiceMutation` (`tx-eligibility.ts:56-143`) re-reads
  status/category/enrollment/sanctions inside the tx.

**Changes — pages (the win only materialises if the layout's viewer lookup switches too, because
`cache()` is shared across layout and page within one render):**

- `app/lib/feature_flags/helpers.ts:17,35,72,146` — import `getCurrentBaseProfile` and use it at `:35`
  (`isFeatureEnabled` implicit viewer), `:72` (`resolveLayoutFlagViewer`, used by the Navbar) **and**
  `:146` (`resolveFeatureFlagMap`; the first spec missed this one). `FeatureFlagViewer` is
  `Pick<BaseProfile, "id" | "role"> | null | undefined` (`visibility.ts:8-11`).
- `app/components/pages/profiles/festivals/map-reservation.tsx:17,61,148` → `getCurrentBaseProfile`;
  at `:148` pass the viewer explicitly: `isFeatureEnabled("credits", currentProfile ?? null)` (never
  `undefined`, which triggers the lookup). Leave `:53` inside `preOpenFullTableOffer` alone (its `actor`
  param has a plain `string` role) — Item 6 deletes that function anyway.
- `app/components/pages/profiles/festivals/hold-confirmation.tsx:11,24` → `getCurrentBaseProfile`
  (uses id/role + `protectRoute`). Note: the server page is this file, not
  `festivals/reservations/hold-confirmation.tsx` (that is the client component).
- `app/(routes)/profiles/[profileId]/festivals/[festivalId]/reservations/[reservationId]/payments/page.tsx:7,40`
  → `getCurrentBaseProfile` (`protectRoute`, `profile.id`).
- `app/data/invoices/actions.ts:34` — switch the import module-wide (`:59,101,157,204,289,333`); every
  `actor` read in the file is `id`/`role`. Required for the payments page.
- `app/components/pages/profiles/festivals/reservation-detail.tsx:22,62,101` → `getCurrentBaseProfile`;
  `isFeatureEnabled("credits", currentProfile ?? null)` at `:101`; `pushPublicKeyFor(currentProfile)`
  accepts `BaseProfile | null`.
- `app/lib/reservations/queries.ts:15` — switch module-wide (`:72,103,151,185`); reads are null checks,
  `canViewAdminReservationData(actor)` (accepts `ReservationActor | null | undefined`) and `actor.id`.

**Tests — every `vi.mock("@/app/lib/users/helpers")` factory that lacks `getCurrentBaseProfile` throws
`is not a function` once its code path reaches the new call. 86 test files mock that module. These are the
ones confirmed to need the key (rename or add `getCurrentBaseProfile: <same mock>`):**

- Unit: `hold-service.test.ts:10-12`, `hold-actions.test.ts:20-22`, `api/stands/status/route.test.ts:12-14`,
  `reservation-detail.test.tsx:49-52`, `reservations/queries.test.ts:11-13`,
  `data/invoices/actions.test.ts:8-10`, `feature_flags/helpers.test.ts:12-14` (keep its "not called on a
  static render" assertions meaningful), `navbar.test.tsx:21-23`, `footer-server.test.tsx:18-20`.
- Integration (in the `test:integration` list): `hold-concurrency` (`:34-36`), `full-table` (`:49-51`),
  `prd-unblockers` (`:61-63`), `pricing-snapshots` (`:38-40`), **`credits/feature-top-up` (`:53-55`)** and
  **`payments/invoice-tender-summary` (`:35-37`)** — the last two were missed by the first spec and are
  confirmed to break. `admin-full-table`, `stand-change`, `full-table-upgrade`, `console-detail` already map
  both keys.
- Add to `app/lib/users/helpers.test.ts`: mirror the `getCurrentUserProfile` describe (`:119-146`) for
  `getCurrentBaseProfile` (failed lookup → null; `NEXT_REDIRECT` rethrown). Promote the anonymous
  `cachedFetchBaseUserProfileByClerkId: vi.fn()` at `:12` to a hoisted named mock.
- Recommended regression guard: in `hold-service.test.ts` and `route.test.ts`, keep a separate
  `getCurrentUserProfile: vi.fn()` and assert it is never called.
- Then the **whole** `pnpm exec vitest run` and the whole `pnpm test:integration` — the static scan that
  produced the list above went three import levels deep; the full runs are the real check.

**Verification.** `tsc` (BaseProfile narrows to `ReservationActor`; `isFeatureEnabled("credits", BaseProfile | null)`
compiles). With SQL logging on a local dev server, `GET /api/stands/status?sectorId=…` must show one plain
`select … from users where clerk_id = $1 limit 1` and no lateral subqueries; the map, confirm, detail and
payments pages must each show exactly one users-by-clerk_id query per request, shared with the navbar.
Impersonation ("Entrar como participante") still renders as the participant and the read-only guard still
refuses holds.

**Risk.** Pages that still call `getCurrentUserProfile` (~140 callers) and also evaluate a flag now gain
one extra single-row lookup. Say so in the PR; converting the remaining `protectRoute` pages and the
`require*` gates is a follow-up.

---

## 7. Item 4 — Auto-refresh at the opening instant (effort S)

**Problem.** At 20:00 nothing on a participant's phone changes. The map page's `RESERVATIONS_NOT_OPEN` card
(`app/components/pages/profiles/festivals/reservation-not-allowed.tsx:113-116`) says "recargala"; the
installed app has no reload button (pull-to-refresh exists but is undocumented). The hub card
(`participation-status-card.tsx:145-150`, `waiting_for_reservations`) shows only the date. Inicio
(`/portal`, where the installed app opens: `manifest.ts:23` → `/launch` → `PORTAL_HREF`) shows the
date-only sentence from `app/lib/home/festival.ts:63-67`. All three states are decided server-side from
the clock (`policy.ts:129-131`; `reservation-card.tsx:150-156` via `hub.ts`), so one `router.refresh()`
after the opening instant swaps in the open state (`use-router.md:46`: refresh re-renders Server
Components; the three routes are request-time dynamic).

**Changes.**

- New `app/components/festivals/reservations/opens-at-refresh.tsx` (`"use client"`):

  ```tsx
  const MAX_TIMEOUT_MS = 2_147_483_647; // longer delays overflow setTimeout and fire at once
  export const JITTER_MIN_MS = 1_000;
  export const JITTER_MAX_MS = 3_000;

  /** ms until the one refresh, or null when already open. */
  export function refreshDelayMs(startsAtMs: number, serverNowMs: number, random = Math.random()): number | null {
    const remaining = startsAtMs - serverNowMs;
    if (!Number.isFinite(remaining) || remaining <= 0) return null;
    return remaining + JITTER_MIN_MS + random * (JITTER_MAX_MS - JITTER_MIN_MS);
  }

  export default function OpensAtRefresh({ startsAt, serverNow, className }: { startsAt: string; serverNow?: string; className?: string }) {
    const router = useRouter();
    const routerRef = useRef(router);
    useEffect(() => { routerRef.current = router; }, [router]);
    const startsAtMs = Date.parse(startsAt);
    const serverNowMs = serverNow ? Date.parse(serverNow) : NaN;
    useEffect(() => {
      const delay = refreshDelayMs(startsAtMs, Number.isFinite(serverNowMs) ? serverNowMs : Date.now());
      if (delay == null) return;
      const fireAt = Date.now() + delay;          // fixed once, on the phone's clock
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refresh = () => { if (done) return; done = true; clearTimeout(timer); routerRef.current.refresh(); };
      const arm = () => {                          // re-arms (not fires) until fireAt has really passed
        clearTimeout(timer);
        const remaining = fireAt - Date.now();
        if (remaining <= 0) { refresh(); return; }
        timer = setTimeout(arm, Math.min(remaining, MAX_TIMEOUT_MS));
      };
      const onVisible = () => { if (document.visibilityState === "visible") arm(); };
      arm();
      document.addEventListener("visibilitychange", onVisible);
      return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
    }, [startsAtMs, serverNowMs]);
    return <p className={cn("hidden standalone:block", className)}>En la app también podés deslizar hacia abajo para actualizar.</p>;
  }
  ```

  Precedents: timeout cap at `occurrence-actions-menu.tsx:48,84-94`; visibility recheck at
  `impersonation-banner.tsx:134-154`; router in a ref at `pull-to-refresh.tsx:44-47`. `serverNow` lets a
  phone whose clock runs ahead refresh early, land "not open" again with a new `serverNow`, and schedule
  another refresh (effect keyed on `serverNowMs`); when the server says open the parent stops rendering
  the component. No `startTransition` needed (Next's refresh already dispatches inside one). The
  `standalone:` variant is `@custom-variant standalone` in `globals.css:18-25` (display-mode standalone OR
  `[data-installed-app]`); no `.tsx` uses it as a utility yet — **confirm it compiles** (grep the built
  CSS for `.standalone\:block`); fallback is the JS pattern from `pull-to-refresh.tsx:50`.
- `participation-status-card.tsx` (server component): in `copyFor` add
  `const opensAtTime = formatDisplayDate(festival.reservationsStartDate, DateTime.TIME_SIMPLE);`; the
  `waiting_for_reservations` case becomes
  `title: \`Las reservas abren el ${opensOn} a las ${opensAtTime}\``,
  `body: "Ya completaste tu inscripción. Cuando llegue la hora, esta pantalla se actualiza sola y vas a poder elegir tu espacio."`.
  After the `copy.body` paragraph render
  `<OpensAtRefresh startsAt={hub.festival.reservationsStartDate.toISOString()} serverNow={new Date().toISOString()} className="text-xs text-brand-neutral" />`
  only when `hub.status === "waiting_for_reservations"`. After the refresh the card becomes
  `approved_enrollment` with the "Reservar stand" button (there is no "Ir a reservas" label).
- `app/(routes)/portal/page.tsx` `hubFestivalCard` (`:118-147`): return a fragment with the same
  `<OpensAtRefresh … serverNow={now.toISOString()} className="-mt-4 text-xs text-brand-neutral" />` while
  waiting. Optional: add the hour to `participationSentence` in `app/lib/home/festival.ts:63-67` (then
  update `festival.test.ts:66`).
- `reservation-not-allowed.tsx` (client): add prop `serverNow?: string`; replace the "recargala" lines
  (`:113-116`) with `Si te quedás en esta página, se actualiza sola a las {opensAtTime}.`; mount
  `<OpensAtRefresh startsAt={props.festival.reservationsStartDate.toISOString()} serverNow={props.serverNow} className="text-xs text-muted-foreground italic" />`
  once, outside the day ternary, **only** in the `RESERVATIONS_NOT_OPEN` branch (not for sanctions or
  other policy codes).
- `map-reservation.tsx:109` — pass `serverNow={new Date().toISOString()}` to `ReservationNotAllowed`
  (the other four call sites fall back to the phone clock; optional).

**Tests.**

- `participation-status-card.test.tsx`: the card now renders a child calling `useRouter()`, so the whole
  file needs `vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal()), useRouter: () => ({ refresh: refreshMock }) }))`.
  Add a `waiting_for_reservations` case using the existing **past** fixture date (31 Dec 2025 20:00 La
  Paz): title "Las reservas abren el 31 de diciembre de 2025 a las 8:00 PM", no links, hint text present.
  Do not use a future date (it would arm a real timer).
- New `opens-at-refresh.test.tsx` with `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })`:
  `refreshDelayMs` edge cases; already open → never refreshes; opens in 10 min → exactly one refresh after
  remaining + jitter (spy `Math.random`); `serverNow` ahead of the phone → fires relative to the server;
  40 days out → cap re-arm works; hidden tab → refresh on `visibilitychange` (override
  `document.visibilityState` with `defineProperty` and **delete it in `afterEach`**); unmount clears the
  timer; new `serverNow` re-schedules. Wrap advances in `act`.
- Run-only: `hub-status.test.ts`, `pull-to-refresh.test.tsx`, `formatters.test.ts`,
  `reservation-card.test.tsx`, `app/(routes)/festivals/page.test.tsx`.

**Verification.** On a local DB set the active festival's `reservationsStartDate` to now + 2 min, open
`/portal`, `/my_participations` and the map page in three tabs as `illustration+clerk_test@example.com`:
at T + 1..3 s all three swap without a full reload; a backgrounded tab refreshes on return; a clock 2 min
ahead refreshes early and again at the real time; a 40-day date does not refresh on load. The hint shows
only in standalone (DevTools display-mode emulation).

**Risks.** Everyone waiting refreshes within 1–3 s of 20:00 — that is the point, but widen the jitter
(exported constants) if the crowd is large. iOS suspends timers in a backgrounded PWA; the catch-up is on
`visibilitychange`. The old body promised "Te avisamos…", which nothing backed; the new copy drops it.

---

## 8. Item 5 — Mobile / installed-app fixes (effort M) — **not second-reviewed; re-verify lines**

**Problems (verified in the first review).** In the installed app the top-bar back arrow and
"Volver al mapa" release the hold with no confirmation (`hold-confirmation-client.tsx:425`
`useScreenBack(handleCancel)`, `:461`); the footer "Cancelar" does the same and sits `gap-1` from
"Confirmar Reserva" (`:569-577`); the sticky footer, the fixed stand card and the toaster ignore
`env(safe-area-inset-bottom)` because the tab bar that pads the body is removed on flow pages
(`app-navigation.ts:955-961` `isFocusedFlowPage`, `app-tab-bar.tsx:117`); the stand card has no
max-height/scroll and no tap-outside dismiss; conflict toasts vanish after 4 s; the StepIndicator
duplicates the top bar; double-tapping the map background zooms the page.

**Changes, in `hold-confirmation-client.tsx`.**

- `:213` `mapUrl` → `` `/profiles/${profile.id}/festivals/${festival.id}/reservations/new` `` (the
  `/sectors/{id}` page is a bare redirect to it — one wasted round trip on every back/cancel/expiry).
- Replace `useScreenBack(handleCancel)` (`:425`) and `onBack={() => handleCancel()}` (`:461`) with a
  `goToMap = useCallback(() => router.replace(mapUrl), [router, mapUrl])`. Keep the `useScreenBack`
  override (without one the bar does `router.back()`, which lands on the page before the map because the
  map was reached by `router.replace`). The map already offers "Continuar con tu reserva" on the held
  stand (`stand-info-card.tsx:468-476`).
- Footer (`:567-587`): wrapper → `sticky bottom-0 border-t bg-background px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]`,
  inner `flex gap-3`, Cancelar `variant="ghost"` opening an `AlertDialog` (component
  `app/components/ui/alert-dialog.tsx`; pattern `reservations/full-table-downgrade-button.tsx:103-148`):
  title `¿Liberar el stand {label}?` (full table: `¿Liberar los stands A1 y A2?`), description
  `Otra persona podrá reservarlo.` / `…reservarlos.`, cancel `Seguir con mi reserva`, destructive action
  `Liberar` → `handleCancel`. State `const [releaseOpen, setReleaseOpen] = useState(false)`.
- `:377-380` and `:383`: `toast.error/info(message, { duration: 8000 })` (sonner 1.7.2 `ExternalToast.duration`).

**Changes elsewhere.**

- `stand-info-card.tsx:295-300`: both failure toasts get `{ duration: 8000 }`.
- `stand-info-card.tsx:315-316`: outer → `fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 animate-slide-up-fast md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] md:left-auto md:right-6 md:w-100`;
  card → add `max-h-[55dvh] md:max-h-[calc(100dvh-6rem)]`. `:317-326` Cerrar: drop `size="sm"`, use
  `className="self-end m-1 h-11 min-w-11 px-3 text-muted-foreground"` (44 px hit area). `:328` content
  div → add `min-h-0 overflow-y-auto overscroll-contain` (the scrolling part; Cerrar stays pinned).
- `client-map.tsx` (around `:112-132`): tap-outside closes the card without a backdrop — track
  `pointerdown` on the `relative` wrapper, and on `pointerup` close only if the pointer moved < 10 px and
  `(e.target as Element).closest("[data-map-stand-id], button")` is null. Mirrors the stands' own 10 px
  threshold (`map-stand.tsx:85-99`). Do **not** use a document-level listener (it would fire inside the
  portaled `HalfTableFallbackDialog`).
- `app/components/ui/sonner.tsx:16-18`: `mobileOffset={{ bottom: "calc(var(--app-bottom-chrome, env(safe-area-inset-bottom)) + 16px)" }}`
  (`--app-bottom-chrome` is set only when `body:has([data-app-tabbar])`, `globals.css:889-897`).
- `step-indicator.tsx:22-27`: add `data-installed-hidden=""` to the root div. Mechanism:
  `globals.css:905-909` `body:has([data-screen-bar]) [data-installed-hidden] { display: none }` under the
  `standalone` variant; the map and confirm routes are declared screens (`screens.ts:154-162`). Web is
  unchanged. Affects every StepIndicator (map, confirm, payments) — intended.
- `zoomable-map-frame.tsx:197`: add `touch-manipulation` to the frame div (`touch-action: manipulation`;
  `manipulation` keeps pan and pinch; react-zoom-pan-pinch handles two-finger pinch itself). CSS
  `touch-action` on SVG `<g>` (`map-stand.tsx:126`) does not apply per spec, which is why the stands'
  existing attribute does nothing. Fallback if iOS still double-tap-zooms: the same class on the `<svg>` in
  `map-canvas.tsx:28`.

**Tests.** Run-only: `screen-bar.test.tsx` (`:111-124` covers `useScreenBack`), `map-surface.test.tsx`,
`app-navigation.test.ts` (`isFocusedFlowPage`). Add `hold-confirmation-client.test.tsx` (no test exists;
mocks after `full-table-downgrade-button.test.tsx:8-15`; render inside `ScreenBarProvider` +
`AppScreenBar` as `screen-bar.test.tsx` does): top-bar back and "Volver al mapa" → `replace(mapUrl)`,
`cancelStandHold` not called; "Cancelar" → alertdialog, "Seguir con mi reserva" keeps the hold, "Liberar"
calls `cancelStandHold(holdId)`; failure codes → toasts with `duration: 8000`. Add `stand-info-card.test.tsx`
(toast durations, Cerrar `h-11`, "Continuar con tu reserva" for an own hold). Add `step-indicator.test.tsx`
(root has `data-installed-hidden`, still renders "Paso 2 de 3" and the back button). Extend
`client-map.test.tsx` from Item 2 with tap-outside / pan / toolbar cases if jsdom's PointerEvent carries
`clientX` (else pass them in the init object).

**Verification on a phone (iOS standalone and Android).** Tap stand → card; tap empty map → closes;
drag with the card open → stays; pinch zooms, double-tap on the background does **not** zoom the page;
card and footer sit above the home indicator; a long card scrolls inside itself. Confirm screen: no
"Paso 2 de 3" row in the app (visible in a browser tab); top-bar back → map with the stand still
EN ESPERA and "Continuar con tu reserva" returning to the running countdown; "Cancelar" → dialog;
"Liberar" releases.

**Risks.** Backing out no longer frees the stand; it stays held until `holdMinutes` expire server-side
(server expiry is enforced — the poll and the hold path both ignore expired holds). The map opens the first
sector with availability, not the held stand's sector; a "Tenés un espacio en espera — continuar" banner is a
worthwhile follow-up. `max-h-[55dvh]` puts the CTA at the end of the scroll on long cards; pin it outside
the scrolling div if that bites.

---

## 9. Item 6 — Parallelise the waterfalls (effort M)

**Problem.** The map page today pays ~20 sequential DB round trips: profile → protectRoute → festival +
profile (2 sequential inside `fetchSelfServiceTargetProfile`) → terms → eligibility (2) → memberships →
DTO (festival + profile → subcats → stands → 8-wide → groups → tx access → flag → offer → hold members),
and the offer + credits flag are fetched **twice** (page `map-reservation.tsx:142` and DTO
`map-queries.ts:527-543`). During the countdown every refresh pays the three denial reads twice although
the clock decides the answer first. Expected after: countdown refresh ≈ 3 stages, allowed map ≈ 6,
confirmation ≈ 4.

**Ship order inside this item (if time is short, stop after the first four).**

1. `app/lib/reservations/map-queries.ts:93-120` `fetchSelfServiceTargetProfile` — run the `users` lookup
   and the `userRequests` enrollment query in one `Promise.all` (the second keys only on the arguments).
   Return shape unchanged.
2. `app/lib/sanctions/reservation-eligibility.ts:35-76` `getReservationEligibility` — `Promise.all` the
   festival probe and the sanctions query; throw "Festival no encontrado" after. 2 round trips → 1 for
   every caller (entry, hub, programs, tx-eligibility, partner-eligibility, admin-actions); the two tests
   that touch it mock the whole module.
3. `app/lib/reservations/entry.ts` `getSelfServicePageDenial`:
   - **Pre-read short-circuit.** `evaluateSelfServiceEligibility` (`policy.ts:103-131`) decides
     `UNAUTHENTICATED`, `UNAUTHORIZED`, `PROFILE_NOT_VERIFIED`, `FESTIVAL_NOT_ACTIVE`,
     `RESERVATIONS_NOT_OPEN` before it reads terms/enrollment/sanctions/participations. After computing
     `now` and `enrollment`, evaluate once with empty read inputs
     (`publishedTermsVersionId: null, sanctionBlocked: false, hasLive…: false, hasRejected…: false`) and
     return early when the code is one of those five. During the countdown that is every refresh → zero
     reads.
   - **One `Promise.all`** for `fetchPublishedFestivalTermsVersion()` (only if
     `participantTermsEnabled`), `getReservationEligibility(...)` and the `reservationParticipants`
     query (both only if profile and festival exist), then the pure evaluation as today, keeping
     `sanctionBlock` on `SANCTION_BLOCKED`.
   - Delete `getSelfServiceDenialAtOpen` (`:126-161`) and its now-unused imports
     (`fetchSelfServiceFestivalSnapshot`, `fetchSelfServiceTargetProfile`, `:7-10`); the map page calls
     `getSelfServicePageDenial({ …, now: festival.reservationsStartDate })` directly with the objects it
     already holds.
   - `policy.ts`: add a comment above the clock check that `entry.ts` relies on those six checks
     preceding every read-dependent input; a reorder must update `PRE_READ_CODES` and the pinned test.
4. `app/components/pages/profiles/festivals/map-reservation.tsx` — reorder with the repo's `started()`
   helper (`app/lib/started.ts`, which exists because `redirect()`/`notFound()` throw and an un-awaited
   promise must not become an unhandled rejection):
   1. `started(fetchSelfServiceFestivalSnapshot(festivalId))` and
      `started(fetchSelfServiceTargetProfile(profileId, festivalId))` (id-keyed, a row each — comment that
      a visitor the route check redirects costs two tiny queries; `reservation-detail.tsx:57-62` does the
      same, `terms.tsx:26-37` chose to defer a heavier tree);
   2. `getCurrentBaseProfile()` + `protectRoute`; `actor = { id, role } | null`;
   3. await both; `notFound()` if missing; `viewingOwnMap = currentProfile?.id === forProfile.id`;
   4. `offerPromise = started(viewingOwnMap ? fetchFullTableOffer({ userId, festivalId, category }) : Promise.resolve(null))`
      and `creditsEnabledPromise = started(isFeatureEnabled("credits", currentProfile ?? null))` — both
      independent of the denial;
   5. `denial = await getSelfServicePageDenial({ actor, targetProfile: forProfile, festival })`;
      `TERMS_STALE` → `<TermsReacceptanceRequired>`; `RESERVATIONS_NOT_OPEN` → at-open re-check
      (`now: festival.reservationsStartDate`, own map only) → render `FullTablePanel` only when that
      re-check is null and the offer exists, then `<ReservationNotAllowed … serverNow=…>`; any other
      denial → as today;
   6. allowed: `activationOfferPromise = started(creditsEnabledPromise.then((on) => (on ? offerPromise : null)))`;
      `Promise.all([fetchFestivalReservationMapDto({ festivalId, profileId, revealHiddenIdentities, activationOffer: activationOfferPromise }), offerPromise, creditsEnabledPromise])`.
      **Do not start the DTO before the denial** (the countdown case would pay ~10 queries per refresh).
   Delete `preOpenFullTableOffer` (`:29-56`) and the `getSelfServiceDenialAtOpen` import.
5. `map-queries.ts:122-586` `fetchFestivalReservationMapDto` — replace `actorProfileId?` with
   `activationOffer?: FullTableOffer | null | Promise<FullTableOffer | null>` (JSDoc: the caller gates it —
   `activateFullTableAccessAction` spends the *session's* credits, so an admin viewing someone else's map
   and anyone whose wallet is flag-hidden must get null). Stage 1, one round trip, all keyed on input ids:
   festival snapshot, profile row, `profileSubcategories`, full-table group ids (was `:500-509`), the
   viewer's live `standHolds` row, **its members via a join on `(userId, festivalId, expiresAt > now)`**
   (valid because `stand_holds_user_festival_idx` is a plain unique index: one row per user+festival) and
   `alreadyReservedRow`. Keep the `!standCategory` early return after stage 1. Stage 2: `standRows`.
   Stage 3: the remaining six of the old 8-wide plus
   `isFullTableCategory(profile.category) ? findActiveFullTableAccess(db, …) : null` (plain `db`, not a
   tx — `DbTx` accepts the pool, `full-table-queries.ts:74-78` already does this) and
   `Promise.resolve(input.activationOffer ?? null)`. Derive `fullTableActivationPrice` from the offer as
   today (`offered && !active && shortfall === 0 ? creditPrice : null`). Delete `:515-543`. ~12 → 3 round
   trips. Drop the `fetchFullTableOffer` / `isFeatureEnabled` imports.
   `sector-reservation.tsx:57` (unrouted) needs only a compile fix: drop `actorProfileId`, pass
   `activationOffer: null`.
6. `map-queries.ts:588-781` `fetchFestivalReservationConfirmationDto` — stage 1 (one round trip): the hold
   **joined with its stand** (nested selection objects are already used at
   `visitors/registration-data.ts:182-185`), scoped to `holdId + userId + festivalId`; festival; profile;
   `holdMembers` by `holdId` (discarded whenever the owner-scoped hold is null, so nothing leaks);
   `searchRecentPartners(festivalId)`; `findActiveFullTableAccess(db, …)` unconditionally. Stage 2 (keyed
   on `stand.festivalSectorId`): sector, thumbnails, active hold rows by sector via a join. Rest unchanged
   (`isFullTable = holdMembers.length > 1`, `isHalfTableFallback = !isFullTable && access != null`, same
   truth table). ~8 → 2.
7. `hold-confirmation.tsx:24-69` — same shape as the map page: `started()` the two id-keyed reads before
   auth, and `started(fetchFestivalReservationConfirmationDto(...))` **before** awaiting the denial (the
   DTO is scoped to `profileId` and `protectRoute` already proved owner-or-admin); await it in the allowed
   path; keep both redirects.

**Tests.**

- `policy.test.ts`: add a case pinning the short-circuit contract — with `now < reservationsStartDate`
  the result is `RESERVATIONS_NOT_OPEN` for every combination of the read-dependent inputs.
- New `entry.test.ts` (mock `server-only`, `festival-terms/queries`, `sanctions/reservation-eligibility`,
  `@/db` with deferred promises): all three reads start before any resolves; conditional skips hold;
  `SANCTION_BLOCKED` carries `sanctionBlock`; each pre-read code returns with **zero** mock calls;
  `now: reservationsStartDate` returns null when only the clock blocked and `NOT_ENROLLED` when
  enrollment is missing (this replaces `getSelfServiceDenialAtOpen`).
- `full-table.integration.test.ts` (`:739-790` already covers the confirmation DTO): add expired hold →
  null; another user's hold → null; `isHalfTableFallback` true with active access and one member.
- New `map-queries.integration.test.ts` — `fetchFestivalReservationMapDto` has **no test today**; write a
  parity test first (seed from `full-table.integration.test.ts`): `activeHold.standIds` has both halves;
  `fullTableGroupIds`; `fullTableAccessActive`; `fullTableActivationPrice === creditPrice` when the offer
  is passed as a value **and** as a promise with shortfall 0, null when null/active; the `!standCategory`
  early return. Register it in `package.json`'s second `test:integration` vitest list.
- New `map-reservation.test.tsx` (model on `credits-introduction.test.tsx`): panel rendered on the
  countdown only for the own map with a null at-open denial; admin on another profile → no panel, no offer
  fetch; `fetchFullTableOffer` and `isFeatureEnabled` called at most once per render; a `protectRoute`
  rejection leaves no unhandled rejection.
- Run-only: `map-dto.test.ts`, `reservation-eligibility.test.ts`, `credits-introduction.test.tsx`,
  `full-table-panel.test.tsx`, `started.test.ts`.

**Verification.** `tsc`, eslint on `app/lib/reservations app/lib/sanctions app/components/pages/profiles/festivals`;
unit suites; integration. With the query logger on a local dev server, the map page shows ~6 stages
instead of ~20 and the panel price/shortfall is unchanged; with `reservationsStartDate` in the future the
first denial call issues **no** terms/sanctions/memberships queries and the at-open check is one 3-wide
batch; as `admin+clerk_test` viewing that participant's page the panel is absent and no offer queries run.
No `unhandledRejection` in the server log when visiting signed out or unverified.

**Risks.** `DEFAULT_POOL_MAX` is 5 (`db/index.ts:85`): a 7-wide stage queues on the pool (no deadlock —
`searchRecentPartners` and `readCreditBalances` each use only their own tx connection), so per-request
latency still drops but more small queries queue under a burst; watch connection counts after deploy.
Queries now run for viewers who end up denied (offer + flag on the own map, the confirm DTO); nothing from
them is rendered. The DTO no longer gates the offer itself — keep the JSDoc so a future caller does not
re-open the "admin spends own credits" bug.

---

## 10. Item 7 — Real `loading.tsx` skeletons for `intro` and `payments` (effort S)

**Problem.** Both routes fall back to the generic `ScreenSkeleton variant="detail"` (a wide hero plus a
two-column grid) that looks nothing like the narrow 560 px credits card or the three-step payment screen,
then jumps to the real layout one round trip later. The map and confirm routes already have real
skeletons (`new/loading.tsx` → `SectorReservationSkeleton`,
`new/sectors/[sectorId]/confirm/loading.tsx` → `HoldConfirmationSkeleton`). How soon a skeleton appears
depends on the entry: a `<Link>` prefetch carries the tree down to the **first** `loading.tsx` below the
first changed segment (`create-component-tree.js:316-345`; `link.md:302`), so from the reservation-detail
link the payments skeleton is in the tap frame; from `/my_participations` the tap frame shows
`profiles/[profileId]/loading.tsx` and the payments skeleton replaces the generic second stage; the intro
is reached only by `router.push` (`terms-form.tsx:96-106`), so its skeleton shows with the first streamed
chunk, where the generic one shows today. No navigation gains a stage. `loading.tsx` only adds a Suspense
boundary; the pages' `redirect()`/`notFound()`/`protectRoute` keep working.

**Changes.**

- New `app/components/festivals/reservations/credits-introduction-skeleton.tsx` mirroring
  `credits-introduction.tsx:68-152`: `container max-w-[560px] p-4 md:p-6`, `role="status" aria-busy="true"`
  with an `sr-only` "Cargando…", two heading bars (`h-9 md:h-10`, the second `w-2/3`), two intro lines, a
  `Card` with a `dt`/`dd` block (`h-4 w-72`, `h-9 w-32`), two paragraphs (5 + 2 lines of `h-3.5`), two
  `rounded-full h-10` button bars (`flex-col gap-2 sm:flex-row`), one `h-4 w-48` link bar. Use
  `Skeleton` from `app/components/ui/skeleton`. No request data.
- New `…/reservations/intro/loading.tsx` rendering it (shape of `new/loading.tsx:1-7`).
- New `app/components/payments/reservation-payment-skeleton.tsx` mirroring the owner/pending branch of
  `payments/page.tsx:120-170`: the **real** `<StepIndicator step={3} totalSteps={3} backLabel="Ver mi reserva" backHref="/my_profile" />`
  (static props, pixel-identical, no reflow; precedent for a client component in a loading file:
  `app/(routes)/my_notifications/[notificationId]/loading.tsx` renders `PageBreadcrumbs`), then
  `container p-4 md:p-6`, an `h-9 w-56 mb-8` title bar, `grid grid-cols-1 md:grid-cols-2 gap-8`: left
  column = ProductDetails card (header bar, `h-24 w-24` graphic + three lines, "Lo que incluye" + four
  lines) and PaymentSummary card (two rows, separator, discount row `h-10 flex-1` + `h-10 w-20 rounded-full`,
  `h-[76px]` notice); right column = QR card (`h-7 w-48`, two lines, `h-80 w-64 rounded-lg`) and an
  `h-10 w-full rounded-full` button bar. Do not mark the heading bar `data-installed-hidden` (the real
  h1 at `page.tsx:135` is not marked either).
- New `…/[reservationId]/payments/loading.tsx` rendering it. `payments/page.tsx` is **not** modified.

**Tests.** Run-only: `app/components/skeletons/loading-coverage.test.ts` (walks the route tree),
`credits-introduction.test.tsx`, `product-details.test.tsx`. Add one-`it` tests for both skeletons modelled on
`screen-skeleton.test.tsx:20-29` (`getByRole("status")` is `aria-busy`, contains "Cargando"); the payments
one also asserts `getByText("Paso 3 de 3")`.

**Verification.** `pnpm exec vitest run app/components/skeletons app/components/festivals/reservations app/components/payments`;
`tsc`. Prefetching only exists in production (`link.md:298`) — check with `pnpm build && next start` (or a
preview deploy), never `next dev`: from the reservation detail's link the payments skeleton is in the tap
frame; from `/my_participations` the stage count did not grow; after confirming a hold the old screen stays
~1 round trip, then the skeleton, then the page. Behaviour unchanged: bad params still redirect/404; another
participant's profileId still hits `protectRoute`.

**Risk.** The intro is often a pure redirect hop to the map (`credits-introduction.tsx:46,:58`); that double hop
exists today and is not made worse. The payments skeleton mirrors only the owner/pending branch.

---

## 11. Deliberately unchanged

- The festival-wide `FOR UPDATE` + global advisory lock in `locks.ts` (throughput ceiling; a separate PR).
- All other `revalidatePath` calls in the reservation modules (§4).
- `sector-reservation.tsx` / `sector-selection.tsx` (unrouted dead code — flag to the owner, do not delete here).
- `staleTimes`, Cache Components, `"use cache"`, Link `prefetch={true}` on "Reservar stand" (it would cache
  the "not open" page for 5 minutes).

## 12. Verification commands

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
pnpm exec tsc --noEmit
pnpm exec eslint <touched files>          # repo has pre-existing lint noise elsewhere
pnpm exec vitest run                      # whole unit suite (Item 3 touches 86 mock factories' assumptions)
```

Integration (disposable Postgres; never `.env.local`'s `POSTGRES_URL`):

```bash
export GLITTER_TEST_DB_PORT=55432
pnpm db:test:up && pnpm migrate:test && pnpm test:integration
```

If Docker is unavailable, a local cluster works the same way: create role `glitter`/`glitter` and database
`glitter_test`, run `POSTGRES_URL=postgres://glitter:glitter@127.0.0.1:5432/glitter_test pnpm exec tsx scripts/migrate.ts`,
then `TEST_DATABASE_URL=postgres://glitter:glitter@127.0.0.1:5432/glitter_test node node_modules/vitest/vitest.mjs --config vitest.reservations.integration.config.mts run <files>`
(the suites refuse any database whose name lacks `test`/`ci`).

Phone checks (installed PWA on iOS and Android, plus a browser tab) are listed per item.

## 13. Acceptance criteria

1. Hold, cancel and confirm action responses carry no page flight tree; `hold-service.ts` does not import `next/cache`.
2. Switching sector tabs fires no server action; a full-table holder sees both halves as their own.
3. `GET /api/stands/status` and the hold/confirm/cancel actions run one plain `users` row lookup; the
   map/confirm/detail/payments pages share one such lookup with the navbar.
4. A participant waiting on `/portal`, `/my_participations` or the map page sees the open state within
   ~3 s of `reservationsStartDate` without touching the phone; the hub shows the hour.
5. In the installed app, back from the confirm screen keeps the hold; "Cancelar" asks first; footer, stand
   card and toasts clear the home indicator; the stand card scrolls; double-tap does not zoom the page.
6. The map page issues no terms/sanctions/memberships queries while the clock blocks, and ~6 stages when
   allowed; the offer and the credits flag are fetched once per render.
7. `intro` and `payments` show layout-shaped skeletons; `loading-coverage.test.ts` stays green.
8. `tsc`, the full unit suite and the full integration suite pass.

## 14. Deferred follow-ups (not in this document)

**Launch-safety mini-batch (small, could follow tonight):** stay on the confirm page with "Reintentar" on
`CONFLICT_RETRY` instead of redirecting; server-driven countdown that never calls `cancelStandHold` from
the phone's clock; a "Reservado" legend entry with a distinct colour for `reserved` stands (today they draw
violet-800, which reads as "Seleccionado"); mark a stand held locally + immediate re-poll on
`STAND_UNAVAILABLE`; recompute `now` after the locks in `createStandHold`; skip the per-admin *email* for
`reservation_created`.

**Reservation hardening (this week):** shared advisory lock + `FOR SHARE` on the festival row +
`SET LOCAL lock_timeout`; batched `cleanupExpiredHolds`; DB errors no longer reading as "signed out"
(`users/queries.ts:44-84`); rate-limit fail-open on the poll route; partner-ineligible message that does
not leak the partner's sanction; voucher upload size/error surfacing; notification for a voucher sent back
and a `submissionId` in the re-upload dedupe key; reminder-cron idempotency; query logger off in production.

**Native-feel navigation (needs its own doc):** confirm in a sheet over the mounted map (`createStandHold`
returns the confirmation DTO; no `confirm/[holdId]` navigation); scope the hub's `fetchFestival({})` query;
`experimental.staleTimes.dynamic`; Cache Components for the map shell; `router.prefetch` of the
post-acceptance href from the terms form; a "Tenés un espacio en espera — continuar" banner on the map.

**Mobile polish:** phone-aware initial map scale (stands ≥ 32 px), `interactiveWidget: "resizes-content"`,
partner/discount input attributes (`autoComplete`, `enterKeyHint`, `autoCapitalize`), the
`min-h-[calc(100dvh-4rem)]` header offset (header is 76 px + inset), `prefers-reduced-motion`, QR
"Guardar en Fotos" copy, voucher preview `object-contain`, an offline fallback page, money formatting and
tú/vos consistency on the payment screens, partners wrongly shown "Completar el pago".
