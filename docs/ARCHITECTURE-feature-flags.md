# Architecture: Feature flags

**Product:** Glitter

**Date:** 2026-07-25

**Status:** Implemented

---

## 1. What this is for

Shipping a feature before launching it. Code merges to `develop` and deploys to production while the
feature stays invisible, then an admin makes it visible when the team is ready — with no redeploy,
no branch kept alive for weeks, and no environment-specific build.

It is deliberately _not_ an experimentation platform: no percentage rollouts, no A/B analysis, no
bucketing. Those belong in PostHog if they are ever needed. This system answers one question —
**who can see this feature right now** — with a visibility level plus an allowlist of specific
people.

## 2. The model

Each flag has one of three visibilities:

| Visibility   | Who sees the feature                              | Typical use                                    |
| ------------ | ------------------------------------------------- | ---------------------------------------------- |
| `hidden`     | Nobody, admins included                           | Work in progress; the default for a new flag   |
| `admin_only` | `admin` and `festival_admin`, production included | Team builds real content and rehearses in prod |
| `public`     | Everyone                                          | Launched                                       |

`admin_only` is the part that makes this worth having. It lets the team populate real data and walk
through a feature in production, against the real database, while the public still gets a 404.

On top of that, a flag can name **individual users** who see the feature regardless of its
visibility — testers, a closed beta, one participant reporting a bug. Following ConfigCat's
evaluation order, targeting is checked _before_ the visibility fallback:

```
isFeatureVisible(rule, viewer):
  1. viewer is in rule.targetedUserIds  → visible
  2. otherwise fall back to visibility  → hidden / admin_only / public
```

So a `hidden` flag with three targeted users is invisible to everyone except those three. Targeting
is **allowlist only** — there is no deny list, so it can only grant access, never take it away, and
a `public` flag is public no matter who is or isn't targeted. Targets are stored in
`feature_flag_user_targets` as real foreign keys, so a deleted profile cascades away instead of
leaving a stale id behind, and an admin can see who has access by name and email rather than by id.

**Code owns the catalogue; the database owns the current value.** Flags are declared in
[app/lib/feature_flags/registry.ts](../app/lib/feature_flags/registry.ts) with a label, a
description, and a default visibility. The `feature_flags` table stores only the current visibility
per key. Adding a flag is a one-line change to the registry — the row is created at its default on
first read, so no data migration is needed. Deleting a flag is equally safe: the orphaned row is
never read again, and the admin UI iterates the registry rather than the table.

Keys are stable identifiers. Renaming one deployed key reads as a brand new flag and silently
reverts to `defaultVisibility`, so rename by adding the new key and removing the old one
deliberately.

## 3. Files

```
app/lib/feature_flags/
  registry.ts               # the catalogue: label, description, defaultVisibility
  definitions.ts            # types and Spanish labels for the admin UI
  visibility.ts             # the whole rule, pure
  visibility.test.ts
  data.ts                   # server-only reads, react cache(), lazy row creation
  helpers.ts                # isFeatureEnabled / requireFeatureEnabled / featureFlagGuard / resolveFeatureFlagMap
  actions.ts                # admin-only mutations
app/components/organisms/feature_flags/
  feature-gate.tsx          # gate part of a page (server)
  client-feature-gate.tsx   # same, inside client render logic
  feature-flag-provider.tsx # flags for a deep client tree (client)
  feature-flags-list.tsx
  feature-flag-card.tsx
  feature-flag-targets.tsx
app/dashboard/feature_flags/page.tsx
```

The split follows `app/lib/store_settings/`: a `server-only` data module that is not a server
action, a pure logic module that is unit-tested without a database, and a `use server` actions file
that validates and authorizes.

## 4. Using a flag

A flag is just a boolean about the current viewer, so it works at any granularity — a whole route, a
section of an existing page, a single button, or a branch inside a server action.

### A whole route

404s for anyone who cannot see it, so an unlaunched feature is indistinguishable from a URL that
does not exist:

```ts
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";

export default async function ProgramsPage() {
  await requireFeatureEnabled("paid_programs");
  // …
}
```

### Part of a page

This is the common case: a page everyone sees, with one new section that only testers get. Wrap the
section — the rest of the page renders normally for everyone else:

```tsx
import FeatureGate from "@/app/components/organisms/feature_flags/feature-gate";

<FeatureGate flag="sticker_hunt_v2">
  <StickerHuntPanel activity={activity} />
</FeatureGate>;
```

`FeatureGate` is a server component, so a viewer without access never receives the markup — the
section is absent, not hidden with CSS. Pass `fallback` to render something in its place.

### A branch in server code

```ts
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";

const showPrograms = await isFeatureEnabled("paid_programs");
```

`isFeatureEnabled` and `requireFeatureEnabled` resolve the signed-in profile themselves. Where the
profile is already loaded, pass it as the second argument to skip the extra resolution; the result
is identical. Both take a `FeatureFlagKey`, so a typo is a compile error rather than a silently
false flag.

### Inside client components

`FeatureGate` is an async server component, so a `"use client"` file **cannot import it**. There are
two ways to gate client markup, and which one you need depends on where the markup lives.

**If a server ancestor can reach the slot,** pass the gate through as `children`. React renders it on
the server and the client component receives finished markup:

```tsx
// server component
<ActivityTabs>
  <FeatureGate flag="sticker_hunt_v2">
    <StickerHuntPanel activity={activity} />
  </FeatureGate>
</ActivityTabs>
```

This keeps the strongest property: the markup never reaches a viewer without access. `ActivityTabs`
can still decide _when_ to render `{children}` — the slot is inert until it does.

**If the markup lives inside the client component's own render logic** — inside a `.map()`, a tab it
builds itself, a modal it mounts on demand — the server has nothing to slot into. Use the boolean.
Pass it as a prop for one flag in one place, or mount the provider for a deep tree:

```tsx
// server
const flags = await resolveFeatureFlagMap();
<FeatureFlagProvider flags={flags}>
  <ActivityEditor />
</FeatureFlagProvider>;

// client, at any depth
const showNewActivity = useFeatureFlag("sticker_hunt_v2");

// or, for the same shape as the server gate
<ClientFeatureGate flag="sticker_hunt_v2">
  <NewActivityFields />
</ClientFeatureGate>;
```

Mount the provider around the subtree that needs it, not globally — the root layout should stay free
of per-request data. Values are resolved on the server, so the provider carries one viewer's
booleans and never the flag configuration or the target list.

The trade-off is real and worth stating: `ClientFeatureGate` suppresses _rendering_, but the gated
component is already in the client bundle. Anyone can read it in devtools. For an unreleased
feature that is usually fine; for unreleased copy, pricing, or data, use the server gate so the
markup is never sent.

### Always gate the action

Hiding a nav entry hides nothing from someone who knows the URL. Hiding a page hides nothing from
someone calling the server action directly. `useFeatureFlag` is a client-side check and can be
flipped in devtools. **The server action is the only real boundary**, so every mutation behind a
flag gets a guard:

```ts
"use server";

export async function joinStickerHunt(input: JoinInput) {
  const blocked = await featureFlagGuard("sticker_hunt_v2");
  if (blocked) return blocked;
  // …
}
```

`featureFlagGuard` returns the codebase's standard `{ success: false, message }` shape or `null` to
proceed, so it drops into existing actions in two lines. Use it rather than
`requireFeatureEnabled` — `notFound()` inside an action produces a confusing response instead of a
usable error.

This matters even more with targeting: a tester allowlisted for a flag must be able to _use_ the
feature, which means the action has to evaluate the same rule the UI did, for that same viewer.
`featureFlagGuard` resolves the current profile, so it does.

## 5. Environments

**Flags are isolated by database, not by a column.** This project runs three database contexts, and
each holds its own `feature_flags` rows:

| Context             | Database                | Effect                                            |
| ------------------- | ----------------------- | ------------------------------------------------- |
| Local development   | your local Postgres     | Flip anything freely; nobody else sees it         |
| Preview deployments | shared staging database | One set of values across **all** preview branches |
| Production          | production database     | The only values the public can be affected by     |

So the same flag can be `public` locally, `admin_only` on staging, and `hidden` in production at the
same time, with no extra machinery. A flip in preview can never reach production because the write
never touches production's database.

Two consequences worth knowing:

- **All preview branches share one set of flag values.** Two people testing different features on
  different preview URLs are editing the same rows. Coordinate, or test that kind of change locally.
- **Pointing a local dev server at staging shows staging's flags**, which is normally exactly what
  you want when reproducing something a preview build is doing.

An `environment` column keyed `unique(key, environment)` off `VERCEL_ENV` was built and then removed.
It bought no isolation this topology does not already provide — and because `VERCEL_ENV` is
`development` on a local machine, a local server pointed at staging would have read a separate
`development` row instead of the `preview` row the deployments use, silently diverging from the
database it was connected to. It becomes worth revisiting only if staging and production ever share
one database, in which case add it before that happens, not after.

Targets are stored per flag row, so they follow the same isolation: allowlisting a tester on staging
does not allowlist them in production.

## 6. Evaluation and caching

`fetchFeatureFlag` is wrapped in React's `cache()`, so a flag and its targets are read at most once
per request regardless of how many components ask — a page with a `FeatureGate` in five places
issues the same queries as a page with one. There is no cross-request cache: a flip is visible on
the very next request, which is the property that makes this a real kill switch.

Flipping a flag or changing its targets calls `revalidatePath("/", "layout")`. A flag can gate any
route, so there is no useful narrower invalidation, and changes are rare and deliberate enough that
the blunt version is the right trade.

## 7. Permissions

| Action                            | Who                       |
| --------------------------------- | ------------------------- |
| See an `admin_only` feature       | `admin`, `festival_admin` |
| See a feature you're targeted for | any signed-in user        |
| Change a flag's visibility        | `admin` only              |
| Add or remove targeted users      | `admin` only              |
| See the dashboard page            | `admin` only              |

Previewing is the wider tier because a festival admin who will administer a feature should be able
to see it before launch. Flipping and targeting are the narrower tier because they change what other
people see. Visibility changes record `updatedByUserId` and `updatedAt`; each target records
`createdByUserId` and an optional note explaining why that person was added.

## 8. Why not PostHog or the Vercel Flags SDK

PostHog is wired here for analytics, and its server client
([app/lib/posthog-server.ts](../app/lib/posthog-server.ts)) returns a noop whenever
`VERCEL_ENV !== "production"` — a PostHog-gated feature would be permanently invisible in preview
and local development, which is where features are built. It is also constructed with the public
project token and no `personalApiKey`, so there is no local flag evaluation: every check would be a
network round trip on a client built per call and never shut down. A gate that decides what the
public can see needs a defined answer for "the flag service is unreachable", and fail-open is not
one.

The Vercel Flags SDK is free and open source, but it is a declaration layer rather than a flag
backend — it still needs a source of truth underneath, whether Edge Config, PostHog, or a database.
Adopting it later is not a rewrite: the decision point here is already a single pure function
reading a single row, which is the shape a `decide()` adapter wants. It becomes worth adding when
the team wants Vercel Toolbar overrides in preview, or several flags with per-environment values.

Environment variables were rejected for a different reason: Vercel applies them at deploy time, so
changing one requires a redeploy before it takes effect. That is not a kill switch.

## 9. Current flags

| Key             | Purpose                                                                                                                                                                      | Default  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `paid_programs` | Paid programs and sessions — Glitter Week catalogue, sales, QR check-in. See [ARCHITECTURE-paid-programs-and-sessions.md](./ARCHITECTURE-paid-programs-and-sessions.md) §14. | `hidden` |

## 10. Possible extensions

Not built, in rough order of likely usefulness:

- Per-environment values, so a flag can be `public` in preview and `hidden` in production.
- An audit trail of changes (currently only the latest actor and timestamp are kept per flag).
- Scheduled flips, for a launch at a known time.
- Targeting by attribute rather than by id — category, festival participation, sign-up date — which
  is where ConfigCat's condition model would start to earn its complexity.
- Percentage rollouts. Deliberately absent: they need stable bucketing and analytics to be worth
  anything, which is PostHog's job, not this system's.
- A deny list. Absent on purpose — targeting that can only grant access is much easier to reason
  about when debugging "why can this person see that?".
