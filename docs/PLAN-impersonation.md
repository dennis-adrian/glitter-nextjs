# Implementation Plan: Entrar como participante

**Product:** Glitter  
**Feature area:** Admin tools, auth, app shell  
**Status:** Proposed  
**Last updated:** 2026-11-01  
**Branch:** `feature/impersonation` from `feature/app-navigation` (PR 608) until that merges

A global admin picks any participant, sees Glitter exactly as that person sees it, with a banner that never goes away, and returns to their own admin session with one tap. The feature is built in the app, on top of the admin's own Clerk session. No Clerk impersonation, actor tokens or multi-session handling are used: those are Pro-plan features, and the dev instance runs in single-session mode anyway.

UI language calls it **Entrar como participante**; while it is on, the app is **viendo como {nombre}** and **solo lectura**.

---

## 1. Decisions locked

| Topic | Decision |
| --- | --- |
| Mechanism | App-level. The admin keeps their own Clerk session. A row in a new `impersonation_sessions` table plus an httpOnly cookie with an opaque token turn every "current viewer" lookup into the participant. |
| Who may use it | Role `admin` only. `festival_admin` and participants never see the entry points, and the server refuses them. |
| Who can be entered | Role `user`, **any status** (verified, pending, paused, rejected, banned). Never an admin or festival admin, never yourself, never a profile with a pending deletion, never while already viewing as someone. |
| Mode | **Read-only.** Every database write, email, push and upload is refused on the server while viewing as someone. Nothing is allowed through. |
| Enforcement point | A write guard on the single `pg.Pool` in `db/index.ts`, plus explicit refusals at Resend, push and UploadThing. Hidden UI is a courtesy, the guard is the boundary. |
| Duration | 60 minutes. The cookie and the row expire together. |
| Exit | A route that checks the real Clerk session, closes the row, clears the cookie and returns the admin to where they started. It depends on no admin page. |
| Expiry mid-browse | The next request renders as the admin again. The banner notices on the client and says the view ended. |
| Audit | The `impersonation_sessions` table: who, whom, started, ended or expired, how many writes were blocked. No page views. Shown as "Recientes" on the picker page and on the person's admin page. |
| Side effects | No push registration, no PostHog identify as the participant, no read-state writes, no emails, no uploads. There is no "last seen" in the codebase. |
| Drift protection | ESLint `no-restricted-imports` keeps `currentUser` / `auth` from `@clerk/nextjs/server` inside the one viewer module. |

---

## 2. Glossary

| Term | Meaning |
| --- | --- |
| Actor | The admin who is signed in to Clerk. Their Clerk user id is `auth().userId` on every request. |
| Subject | The participant being viewed. Their `users` row is what every helper returns while the view is on. |
| View session | One row of `impersonation_sessions`, from entering to exiting or expiring. |
| View cookie | `glitter_view_as`: httpOnly, Secure, SameSite=Lax, path `/`, holding the random token whose SHA-256 is stored on the row. |
| Viewer resolution | The one place that decides whose profile the request is for. |

---

## 3. How a request resolves its viewer

```
request
  └─ auth() → actor Clerk id, actor Clerk session id        (Clerk, as today)
       └─ view cookie present?
            no  → viewer = actor's profile                   (unchanged)
            yes → row by token hash, where
                    ended_at is null
                    and expires_at > now()
                    and admin_clerk_session_id = actor's session id
                    and actor's profile.role = 'admin'
                  found → viewer = subject's profile, mode = viewing
                  not found → viewer = actor (the cookie is ignored, see 5.4)
```

Cached per request with React `cache`, so the row is read once. The binding to the Clerk session id means a stolen cookie is worthless in another browser, and signing out of Clerk ends the view by itself.

The three facts the rest of the app needs come from one module, `app/lib/impersonation/viewer.ts`:

- `getViewerClerkId()` — the subject's Clerk id while viewing, the actor's otherwise. Replaces every direct `auth().userId` / `currentUser().id`.
- `getImpersonation()` — `null`, or `{ sessionId, actor: BaseProfile, subject: BaseProfile, expiresAt }`.
- `isImpersonating()` — boolean, safe to call anywhere (returns `false` outside a request, including static renders, the way `getLayoutViewer` already guards).

---

## 4. Schema

```ts
export const impersonationEndReasonEnum = pgEnum("impersonation_end_reason", [
  "exited",   // Salir
  "signed_out", // the Clerk session behind it ended
]);

export const impersonationSessions = pgTable(
  "impersonation_sessions",
  {
    id: serial("id").primaryKey(),
    adminUserId: integer("admin_user_id").references(() => users.id, { onDelete: "set null" }),
    subjectUserId: integer("subject_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Kept as text so the audit survives the profile rows. */
    adminClerkId: text("admin_clerk_id").notNull(),
    subjectClerkId: text("subject_clerk_id").notNull(),
    /** The Clerk session the view is bound to; another session cannot use the cookie. */
    adminClerkSessionId: text("admin_clerk_session_id").notNull(),
    tokenHash: text("token_hash").unique().notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    endedAt: timestamp("ended_at"),
    endReason: impersonationEndReasonEnum("end_reason"),
    blockedWrites: integer("blocked_writes").default(0).notNull(),
    /** Where Salir returns to: the admin page the view was started from. */
    returnTo: text("return_to"),
  },
  (t) => [
    index("impersonation_sessions_admin_started_idx").on(t.adminUserId, t.startedAt),
    index("impersonation_sessions_subject_started_idx").on(t.subjectUserId, t.startedAt),
  ],
);
```

A row with `ended_at` null and `expires_at` in the past reads as **expirada**; nothing has to run to mark it. `blocked_writes` is bumped outside the guarded scope (see 6) so the audit can record the attempt.

Migration: `pnpm generate` → `drizzle/0305_impersonation_sessions.sql`. Applied locally with `pnpm migrate` after confirming `POSTGRES_URL` points at `localhost`. Production applies it through `vercel-build` on deploy, which is Dennis's call as always.

---

## 5. Server flow

### 5.1 Start — `startImpersonationAction(subjectId, returnTo)` in `app/lib/impersonation/actions.ts`

1. `requireAdmin()` on the **real** viewer (`getImpersonation()` must be null; an admin already viewing as someone is refused).
2. Load the subject: `role = 'user'`, `id !== admin.id`, no `pending_user_deletions` row for its `clerk_id` with `local_deleted_at` null. Otherwise `{ success: false, message }`.
3. `randomBytes(32)` → token; store `sha256(token)`; `expires_at = now + 60 min`; `admin_clerk_session_id = auth().sessionId`; `return_to` only when it is a same-origin path under `/dashboard`.
4. Set the cookie (`maxAge` 3600) and return `{ success: true, redirectTo: "/portal" }`. The client navigates with a **full document load** (`window.location.assign`), not `router.push`: Clerk's client `userId` stays the admin's during a view, and client caches keyed on it (`useNavbarProfile`, the program price eligibility in `viewer-session-price.tsx`) would otherwise keep showing the admin's data.
5. PostHog: one server event `impersonation_started` with `subject_id`, attributed to the admin.

### 5.2 While viewing

Every place that read Clerk's identity, sorted by what it needs (done in step 2):

| Needs | Call sites | Now uses |
| --- | --- | --- |
| Whose profile | `getCurrentUserProfile`, `getCurrentBaseProfile`, `getCurrentNavbarProfile` (`app/lib/users/helpers.ts`); `app/api/users/navbar-profile/route.ts`; `resolveInboxViewer` (`app/lib/notifications/queries.ts`); the three `my_profile` pages; the 16 UploadThing middlewares (`app/api/uploadthing/core.ts`, through a local `currentUploader`) | `getViewerClerkId()` |
| Whether anyone is signed in | `app/page.tsx`, `app/launch/route.ts`, the supplies page and the supplies product notice | `isSignedIn()` |
| The Clerk account itself | `createUserProfile` (`app/lib/users/actions.ts`), from its own email | `getCurrentClerkUser()`, unchanged |

`getCurrentClerkUser` is documented as the Clerk account, never the viewer. ESLint (`no-restricted-imports`) refuses `auth` and `currentUser` from `@clerk/nextjs/server` and `getCurrentClerkUser` everywhere except `viewer.ts`, `users/queries.ts` and `createUserProfile`, each with a commented exemption. Test files are exempt; they mock rather than call.
- Everything downstream is unchanged: `requireAdmin` is false, `/dashboard` redirects to `/`, `protectRoute` sees the subject's status, feature flags, navigation, Inicio and the hub resolve for the subject.

### 5.3 Exit — `POST /api/impersonation/exit` (route handler)

1. `auth()` must be signed in; the view row for the cookie must be bound to this Clerk session (an expired row still ends cleanly).
2. Inside `allowImpersonationWrites()`: set `ended_at`, `end_reason = 'exited'`.
3. Clear the cookie; respond with `{ returnTo }` (`return_to` or `/dashboard`). The banner's Salir button posts, then `window.location.replace(returnTo)`, a full document load for the same reason as entering.

A route handler rather than a server action so it is callable from the banner on every page, including `force-static` ones, with no RSC round-trip and no dependency on the page it is on.

### 5.4 Expiry

- Cookie `maxAge` and `expires_at` coincide, so most expiries never reach the server.
- A request that still carries the cookie past `expires_at`, or one bound to another Clerk session, resolves as the admin and ignores the cookie. A render cannot clear it (`cookies().set` only works in a Server Function or Route Handler, per the Next 16 docs), and it needs no clearing: it resolves to nothing and its `maxAge` removes it within the hour. The exit route and the next start overwrite it.
- **Who writes `signed_out`:** the sign-out button (`app/components/user_dropdown/sign-out-button.tsx` and Más) posts to the exit route with `reason: "signed_out"` before calling Clerk's `signOut`. A sign-out that skips our button (another tab, Clerk revoking the session) leaves the row open; it reads as **expirada** at `expires_at`, which is accurate enough for the audit and grants nothing meanwhile, because the row only resolves for the Clerk session it was bound to.
- **A view that stops resolving early** (the admin demoted, the participant promoted to staff, a profile replaced) also leaves the row open until `expires_at`. Same reasoning: it can no longer resolve, and it reads as expired within the hour.
- The banner is mounted with `expiresAt`; a client timer and a `visibilitychange` check flip it to the ended state at that time: "La vista como {nombre} terminó" with "Volver a mi cuenta" (`router.refresh()` → admin again).

---

## 6. Read-only enforcement

### 6.1 Database guard — `db/write-guard.ts`, `db/statement-kind.ts`, installed in `db/index.ts` (done in step 3)

- `installWriteGuard(pool)` wraps `pool.connect`, in both its promise and callback forms, and the `query` of every client the pool hands out. `pool.query` checks a client out through `connect`, so Drizzle's reads, writes and transactions, `db.execute`, and raw `pool.query` all pass through it. It is installed once, with the pool, so both of Turbopack's module copies share it.
- `classifyStatement(sql)` is pure and tested on 59 statements. Before looking at keywords it strips comments (including nested block comments), string literals (standard, `E''`, dollar-quoted) and quoted identifiers.
  - **Read:** `select`, `values`, `table`, `show`, `explain` without `analyze`; transaction control and `set`/`lock`; `select … for update`, which only locks; `with` whose CTEs only read.
  - **Write:** anything else, including an unknown keyword, a data-modifying CTE, `select … into`, `explain analyze`, and a multi-statement text with any write in it.
- **Reads stay synchronous pass-throughs.** A write waits for the async check, and any statement sent on the same client after it waits too, so a check never lets a later statement overtake an earlier one inside a transaction.
- `refuseDuringView()`:
  1. Reads the view cookie first. Without one, or outside a request (scripts, cron work, a page's `after`), nothing is viewing.
  2. Only with a cookie does it load the viewer (lazily, so scripts never import `server-only` code) and ask `isImpersonating()`.
  3. During a view it counts the refusal on the row, inside the allowed scope, and throws `ImpersonationReadOnlyError` (code `IMPERSONATION_READ_ONLY`, message "Estás viendo la app como otra cuenta: solo lectura."). Next's own throws are handed back with `unstable_rethrow`.
- **One answer per request.** `getImpersonation` memoizes the view in a `WeakMap` keyed by the request's cookie store, not React `cache`, which does not hold in Server Actions and Route Handlers. The profile and the guard therefore cannot disagree, even if the view ends mid-request.
- `allowImpersonationWrites(fn)` is an `AsyncLocalStorage` scope that awaits `fn` inside itself, so a lazy Drizzle query runs in scope. It is for the view's own bookkeeping. ESLint refuses it outside `app/lib/impersonation`.
- **Integration-tested on a real pool:** inserts, updates and deletes are refused; a refused write rolls back its transaction; a data-modifying CTE through `db.execute` is refused; `pool.query` is refused and the pool keeps working; the allowed scope survives a brand-new connection; writes outside a request pass.

### 6.2 What a plain visit writes, and how each is handled

An inventory of every participant page, GET route and action-on-mount (step 3) found few writes. Reads filter expired rows by time instead of sweeping them, and no render registers an `after` or processes an outbox.

| Write on a plain visit | Whose | During a view |
| --- | --- | --- |
| Lazy default rows: `store_settings` (`StoreSectionGate`, `/portal`'s store strip), `program_settings` (`/programs`), a feature flag's first row | Nobody's. The first two crash their page if refused while the row is missing | Let through with `allowHousekeepingWrite` (`app/lib/impersonation/housekeeping.ts`): idempotent `ON CONFLICT DO NOTHING` inserts only. ESLint makes each use a commented exemption. |
| Rate-limit counters (`consumeActionRateLimit`), e.g. `/api/stands/status` polled every 4 s | Keyed to the viewer | Not counted: an admin's view is not rate limited and does not spend the participant's allowance. Refused, the map would go stale on 429s. |
| Notification read on open (`/my_notifications/[id]/open`, the item page, the popover), gift banner celebrated on mount | The participant's | `markNotificationRead` and `markGiftsCelebratedAction` do nothing and answer as done, so the client's `void` calls raise nothing. The participant still finds them unread and uncelebrated. |
| Push device save, refresh, release and forget (`use-push-device` on mount; `releaseForeign…` would delete the **admin's** own device) | The admin's browser | All four push actions return the read-only result before touching anything. |
| Cancelling an expired stand hold when its countdown ends | Housekeeping on the participant's hold | Refused by the guard. The client toasts and returns to the map; reads already ignore expired holds. |

### 6.3 Other chokepoints (done in step 3)

| Where | Change |
| --- | --- |
| `app/vendors/resend.ts` | `sendEmail` and `sendBatchEmails` call `refuseDuringView()` first, for the sends that write nothing before them. |
| `app/api/uploadthing/route.ts` | `POST` answers 403 with the read-only message while `isImpersonating()`, before UploadThing sees the request. This has to happen on the person's own request: several routes' `onUploadComplete` write from UploadThing's callback, which carries no cookie, so the database guard never sees the view there. One check covers all 21 routes, guest checkout included. The marker cookie and the `proxy.ts` rule first planned are dropped. |
| Explicit notification actions (mark unread, archive, unarchive, mark all read) | Return the read-only result, so the inbox shows the message instead of a thrown error. |
| `app/lib/notifications/push/send.ts` | **No change.** A delivery only ever follows a new notification row or a claimed delivery row, and the guard refuses both during a view, so a refusal there would never run. |
| `app/components/providers/posthog-identify.tsx` | No change. `useUser()` is still the admin, so the client stays identified as the admin. |
| Push and avisos UI (`use-push-device`, the avisos control) | Hidden while viewing: step 5, from the banner's context. |

### 6.4 What the admin sees when something is blocked

The banner already says **solo lectura**. Most actions catch their own errors and answer `{ success: false, message }`, which their forms show as a toast. **Known limit:** an action that lets the guard's error escape, called from a form with `useActionState`, reaches the route's error boundary instead of a toast. Step 8's manual pass covers the common flows (add to cart, edit profile, upload a voucher, vote); any that crash get a `try/catch` with `isImpersonationReadOnlyError` returning `IMPERSONATION_READ_ONLY_RESULT`.

---

## 7. Entry points and screens

### 7.1 Navigation — `app/components/navbar/app-navigation.ts`

In `buildStaffNavigation`, for `isAdmin` only, the `account` group gains:

```ts
{
  key: "impersonate",
  label: "Entrar como participante",
  description: "ver la app como cualquier cuenta",
  href: "/dashboard/impersonate",
  icon: UserRoundSearchIcon,
}
```

It appears in Más (`more`) and in the sidebar's "Mi cuenta" group. The desktop account menu (`app/components/ui/user-dropdown.tsx`) gets the same row for admins.

### 7.2 Picker — `/dashboard/impersonate` (`app/dashboard/impersonate/page.tsx`)

- `requireAdmin()` or `notFound()`.
- Search field (name or email, `userSearchCondition`, `role = 'user'`, 20 results, debounced through a `"use server"` fetcher), each row: avatar, name, email, status badge, category.
- "Recientes": the admin's last 10 view sessions with subject, when, how long, how it ended.
- Tapping a row opens the confirmation: name, email, status; "Vas a ver Glitter como esta persona. Solo lectura: no se guarda nada, no se envían correos ni avisos. La vista termina sola a los 60 minutos." Buttons **Entrar** / **Cancelar**.

### 7.3 Person's admin page — `/dashboard/users/[profileId]`

`ProfileQuickActions` gains "Entrar como {nombre}" for admins when the profile is eligible; same confirmation; `returnTo` = that page. Below the profile, "Vistas recientes" lists this person's view sessions.

### 7.4 Banner — `app/components/impersonation/impersonation-banner.tsx`

- Server component in `navbar.tsx`, first child of the sticky `data-site-navbar` wrapper, above the announcement strip and the installed app's top bar; it is therefore above the header on desktop and above `AppScreenBar` in the installed app, and the tab bar is untouched.
- Content: eye icon, "Estás viendo como **{nombre}**" (email on desktop), "solo lectura", and **Salir**. One line on the phone; the name truncates, Salir never does.
- Publishes `--impersonation-banner-height` with a `ResizeObserver`, the way the announcement strip publishes its height. The offsets that subtract `--announcement-strip-height` (`globals.css`, `dashboard/layout.tsx`, store nav and subheader, data table, sonner, program agenda and session page) add this variable too.
- `ImpersonationProvider` (client context) carries `{ subject, expiresAt }` so the banner, the avisos control and the quick actions can ask `useImpersonation()`.
- `force-static` pages (`/programs/*`) render the layout without a request: there the client banner fetches `GET /api/impersonation` on mount and renders if a view is on. The same endpoint backs the expiry re-check.
- Ended state (expired): "La vista como {nombre} terminó" + "Volver a mi cuenta".

### 7.5 Design board T (canvas)

Added to the "Glitter App Navigation Proposals" canvas beside R and S, following their conventions (normal case, no invented copy, banners drawn whole):

1. Más (admin) with the new row under "Mi cuenta".
2. Picker on the phone: search, results, Recientes.
3. Confirmation sheet.
4. Banner over the subject's Inicio: phone browser, installed app with the top bar on a deep screen, desktop with the sidebar.
5. Salir → back on `/dashboard/users/{id}`.
6. Expired state, and a blocked action's toast.

---

## 8. Files

| Area | Files |
| --- | --- |
| Schema | `db/schema.ts`, `drizzle/0305_*.sql` (generated) |
| Core | `app/lib/impersonation/viewer.ts`, `cookie.ts`, `queries.ts`, `actions.ts`, `housekeeping.ts`, `eligibility.ts`, `definitions.ts`; `db/write-guard.ts`, `db/statement-kind.ts` |
| Viewer resolution | `app/lib/users/helpers.ts`, `app/lib/users/queries.ts`, `app/api/users/navbar-profile/route.ts`, `app/page.tsx`, `app/lib/notifications/queries.ts`, `app/launch/route.ts` |
| Guard | `db/index.ts`, `app/vendors/resend.ts`, `app/lib/notifications/push/actions.ts`, `app/lib/notifications/read.ts`, `app/lib/notifications/actions.ts`, `app/lib/rate-limit.ts`, `app/lib/store_settings/data.ts`, `app/lib/programs/data.ts`, `app/lib/feature_flags/data.ts`, `app/api/uploadthing/route.ts` |
| Routes | `app/api/impersonation/route.ts` (GET state), `app/api/impersonation/exit/route.ts` |
| Screens | `app/dashboard/impersonate/page.tsx` + components under `app/components/impersonation/` (picker, confirmation, recent list, banner, provider) |
| Entry points | `app/components/navbar/app-navigation.ts`, `app/components/ui/user-dropdown.tsx`, `app/components/user_profile/public_profile/quick-actions.tsx`, `app/components/pages/dashboard/user/user.tsx` |
| Shell | `app/components/navbar/navbar.tsx`, `app/components/navbar/screens.ts` (title "Entrar como participante", parent Más), `app/globals.css` and the sticky-offset consumers |
| Client suppression | `app/components/notifications/use-push-device.ts` and the avisos control |
| Lint | `eslint.config.mjs`: `no-restricted-imports` for `currentUser`/`auth` from `@clerk/nextjs/server` outside `app/lib/impersonation/viewer.ts` and `app/lib/users/queries.ts` |
| Docs | this file; a short section in `AGENTS.md` pointing writers of new "current user" code at `getViewerClerkId` |

---

## 9. Tests

Unit (vitest + @testing-library, no jest-dom):

- `classifyStatement`: inserts, updates, deletes, CTE-wrapped writes, `select … for update`, comments before the keyword, `explain`.
- Write guard: a write while viewing throws and counts; a write outside a request passes; `allowImpersonationWrites` lets the exit through.
- Eligibility: admin / festival_admin / self / pending deletion refused; every participant status accepted.
- Viewer resolution: cookie without row, row of another Clerk session, expired row, actor no longer admin → actor; live row → subject.
- Start action: non-admin refused, already viewing refused, `returnTo` outside `/dashboard` dropped.
- Exit route: closes the row, clears the cookie, answers `returnTo`; a foreign session is refused.
- Navigation: the row exists for `admin`, not for `festival_admin`, not for participants; `/dashboard/impersonate` resolves its screen title and parent.
- Banner: renders name and Salir; posts to exit and replaces the route; flips to the ended state at `expiresAt`.
- `markNotificationRead` and `savePushDeviceAction` are no-ops while viewing.
- UploadThing route handler: `POST` refused while viewing, UploadThing's own callback (no view cookie) let through.

Integration (added to `test:integration`): `app/lib/impersonation/sessions.integration.test.ts` — start, resolve, exit, expiry, blocked-write counter against the disposable Postgres.

Manual, against the local database with the seed accounts (`admin+clerk_test@…`, OTP `424242`): enter as `illustration`, `pending` and a banned profile; browse Inicio, Participaciones, Tiendita, notifications; try adding to the cart and saving the profile (blocked with a toast); Salir from a deep installed-app screen; let a 1-minute test session expire; confirm `festival-admin` has no row and gets `notFound` on the picker.

---

## 10. Order of work

1. Schema + migration, `definitions.ts`, `eligibility.ts`, `queries.ts` (with tests).
2. `viewer.ts`, `cookie.ts`; reroute the six viewer-resolution call sites; ESLint rule. Typecheck.
3. Write guard in `db/index.ts` and the chokepoints (with tests).
4. Start action, exit route, state route.
5. Banner, provider, CSS variable, offsets.
6. Navigation row, account menu, quick actions, picker page, recent lists.
7. Board T on the canvas.
8. Local render and the manual pass; adversarial review; fix; open the PR into `feature/app-navigation` (or `develop` once 608 merges).

---

## 11. Out of scope

- Acting as the participant (a "full" mode with a blocklist).
- Recording page views.
- Clerk-side impersonation, actor tokens, multi-session handling.
- Entering as staff accounts.
