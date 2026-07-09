# PRD: Participant Status Management

**Product:** Glitter
**Feature area:** Admin user management, participant lifecycle, festival eligibility
**Status:** Proposed
**Last updated:** 2026-07-07

---

## 1. Summary

Glitter needs a clearer way to separate participant accounts from profile requests, measure participant activity, and pause inactive accounts without treating them as banned.

The current system already has a central `users.status` enum with `verified`, `pending`, `rejected`, and `banned`. This feature formalizes the status groups:

- **Participants:** `verified`, `banned`, and the new `paused` status.
- **Profile requests:** `pending` and `rejected`.

Participants are users who have been accepted into Glitter at some point. Banned and paused participants are still part of the participant history, but they are not active participants. Profile requests are users who are still awaiting approval or were rejected before becoming participants.

Admins will get a global participants view that highlights participant activity, including last real festival participation, last terms acceptance, and pause eligibility. Admins can manually pause eligible users, triggering an explanatory email. Paused users cannot accept festival terms, reserve stands, participate in festival flows, or receive invitation emails until an admin unpauses them.

---

## 2. Goals

- Make it easy for admins to see how many active and past participants exist.
- Move pending and rejected profiles out of the main participant list and into profile requests.
- Keep banned users accessible from the global participants page behind a filter.
- Show participant recency using human-friendly labels such as `5 months ago`, with an exact date available on click/tap.
- Show the most recent date/time when the participant accepted terms and conditions for any festival.
- Add a non-punitive `paused` account state for inactive participants.
- Mark participants who are eligible to be paused.
- Email users when their account is paused, explaining that it is a clean-up action and not a punishment.
- Prevent paused users from accessing festival terms, receiving invitation emails, or being counted as active.

---

## 3. Non-Goals

- Automated bulk pausing in the first release.
- Self-service unpause requests in the first release, unless implemented as a simple admin-visible contact path.
- Replacing the existing `user_requests` festival participation request flow.
- Changing the meaning of `banned`; banned remains punitive and separate from paused.
- Reclassifying external participants in `external_participants`; this PRD only covers internal user profiles in `users`.

---

## 4. Definitions

| Term | Definition |
| --- | --- |
| Profile status | The value in `users.status`. Currently `verified`, `pending`, `rejected`, `banned`; this feature adds `paused`. |
| Participant | A user who has been verified before and belongs in participant history. Includes `verified`, `paused`, and `banned`. |
| Active participant | A participant with `users.status = verified`. |
| Past participant | A participant that is no longer active because `users.status` is `paused` or `banned`. |
| Profile request | A non-participant profile awaiting or denied verification. Includes `pending` and `rejected`. |
| Terms acceptance | A `user_requests` row with `type = festival_participation` and `status = accepted`. Existing creation happens in `createUserEnrollment`. |
| Real participation | A `reservation_participants` row connected to a `stand_reservations` row with `status = accepted`. This is stricter than accepting terms. |
| Pause eligibility | A verified participant has not had real participation in any of the last 3 festivals. |

---

## 5. Current Implementation Context

### Data model

- `db/schema.ts` defines `userStatusEnum` as `verified`, `pending`, `rejected`, `banned`.
- `users.status` is the source of truth for profile status.
- `users.verifiedAt` records when the profile became verified.
- `user_requests` stores profile/festival requests:
  - `type = festival_participation` means a festival enrollment or terms acceptance.
  - `status = accepted` means accepted terms / enabled for that festival.
- `stand_reservations` stores stand reservations.
- `reservation_participants` is stored in table `participations` and links users to reservations.

### Existing routes and surfaces

| Route / module | Current role |
| --- | --- |
| `/dashboard/users` | Global users table with server-side filters by profile status, category, query, completion, and admins. |
| `/dashboard/requests` | Global request table for `user_requests`, not the same as profile verification requests. |
| `/dashboard/users/[profileId]/requests` | Admin surface for a single user's requests. |
| `/dashboard/festivals/[id]/allowed_participants` | Festival invitation/allowed participants flow. |
| `/profiles/[profileId]/festivals/[festivalId]/terms` | Terms and conditions acceptance route for a user/festival. |
| `/festivals/[id]/terms` | Terms flow alias that redirects authenticated users into the profile-scoped terms route. |
| `/profiles/[profileId]/festivals/[festivalId]/reservations/new` | Reservation flow gated by verified status and festival enrollment. |

---

## 6. Product Requirements

### FR-01: Status groups

The app must expose two primary admin groups:

| Group | Included statuses | Default visible statuses |
| --- | --- | --- |
| Participants | `verified`, `paused`, `banned` | `verified`, `paused` |
| Profile requests | `pending`, `rejected` | `pending`, `rejected` |

Acceptance criteria:

- `/dashboard/users` becomes or is relabeled as the global participants page.
- The participants page defaults to active and paused participants, excluding banned unless the admin selects a banned filter.
- Profile requests have their own admin page or filtered entry point showing `pending` and `rejected` users.
- Admin users are excluded by default, preserving existing `includeAdmins` behavior.
- Counts clearly distinguish active, paused, banned, and total participants.

### FR-02: Participant activity columns

The global participants page must show:

- Last real participation.
- Last terms acceptance.
- Total accepted participations.
- Total festival terms acceptances.
- Pause eligibility marker.

Acceptance criteria:

- Last real participation displays a relative label such as `5 months ago`.
- The exact datetime is available through a touch-friendly UI: recommended pattern is a button or popover, not hover-only tooltip.
- If no real participation exists, display `Nunca participó`.
- Last terms acceptance displays the same relative/exact-date pattern.
- If no terms acceptance exists, display `Nunca aceptó términos`.
- Activity fields should be sortable or filterable where practical:
  - Sort by last real participation.
  - Filter by pause eligibility.
  - Filter by status.

### FR-03: Pause account status

The app must add `paused` to the profile status lifecycle.

Acceptance criteria:

- Add `paused` to `userStatusEnum`.
- Add UI labels and badges for paused accounts.
- Paused users are participant-history users, not profile requests.
- Paused users are not counted as active participants.
- Paused users cannot start or complete festival participation flows.
- Paused users can still sign in and view their profile/history unless a route has a separate verified-only requirement.

### FR-04: Pause eligibility

Admins can pause only eligible users.

Eligibility rule:

A user is eligible to pause when all of these are true:

- `users.status = verified`.
- The user is not an admin or festival admin.
- The user has not had a real participation in any of the latest 3 festivals.

Latest 3 festivals definition:

- Use the latest 3 non-draft festivals that have rows in `festival_dates`.
- Rank by `max(festival_dates.end_date) desc`, requiring `min(festival_dates.start_date) <= now()`.
- Include `published`, `active`, and `archived` statuses only.
- Do not use deprecated `festivals.start_date` / `festivals.end_date`.

Real participation definition:

- A `reservation_participants` row joined to `stand_reservations`.
- `stand_reservations.status = accepted`.
- `stand_reservations.festivalId` is in the latest 3 festival ids.

Acceptance criteria:

- Eligible participants are visually marked in the participants table.
- Ineligible participants show why they cannot be paused, such as:
  - Already paused.
  - Banned.
  - Admin account.
  - Participated in one of the latest 3 festivals.
- The pause action is disabled for ineligible rows.
- The server action re-checks eligibility before writing, even if the UI button is enabled.

### FR-05: Manual pause action

Admins can manually pause eligible users from the participants table or profile actions menu.

Acceptance criteria:

- Action requires `currentProfile.role = admin`.
- Action only succeeds for eligible users.
- Action updates `users.status` from `verified` to `paused`.
- Action records audit metadata.
- Action sends a pause notification email.
- Action revalidates:
  - `/dashboard/users`
  - `/dashboard/participants` if created separately
  - affected profile pages

### FR-06: Pause audit history

The app should record pause/unpause events separately from the current status.

Recommended new table: `user_status_events`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `userId` | integer FK -> `users.id` | Paused/unpaused user. |
| `fromStatus` | `user_status` | Previous status. |
| `toStatus` | `user_status` | New status. |
| `reason` | text | Admin-entered or system-provided explanation. |
| `createdByUserId` | integer FK -> `users.id` nullable | Admin who performed action; nullable for future automation. |
| `createdAt` | timestamp | Defaults to now. |

Acceptance criteria:

- Pause writes an event from `verified` to `paused`.
- Future unpause writes an event from `paused` to `verified`.
- The participant detail page can show status history in a later iteration.

### FR-07: Paused-user restrictions

Paused users must not be invited or allowed into festival enrollment flows.

Acceptance criteria:

- Terms pages reject paused users with a clear message and no acceptance CTA.
- `createUserEnrollment` rejects paused users server-side.
- Allowed participant / invitation queries exclude paused users by default.
- Festival invitation email sending excludes paused users.
- Partner search excludes paused users because it already requires `users.status = verified`.
- Stand reservation creation continues to reject paused users because `createReservation` currently requires `forUser.status === verified`; confirm any newer hold/confirmation actions also check verified status.
- Activity enrollment, product submission, and any participant-only flows should use `status = verified` as the active-user check.

### FR-08: Unpause path

The first implementation should include an admin unpause action even if user-requested unpause is manual.

Acceptance criteria:

- Admins can change `paused` back to `verified`.
- Unpause writes a `user_status_events` audit row.
- Unpause does not automatically enroll the user in an upcoming festival.
- Unpaused users become eligible to accept terms and receive invitations again.

Recommended copy in the UI:

- Button: `Reactivar cuenta`
- Confirmation: `Esta cuenta volverá a poder aceptar términos y recibir invitaciones.`

---

## 7. User Experience

### 7.1 Participants page

Recommended route: keep `/dashboard/users` for now but change title/copy to `Participantes`.

Default filters:

- `status = verified`
- `status = paused`
- `includeAdmins = false`

Top summary cards:

| Card | Count |
| --- | --- |
| Participantes activos | `status = verified` |
| Pausados | `status = paused` |
| Vetados | `status = banned` |
| Participantes históricos | `verified + paused + banned` |

Table columns:

| Column | Notes |
| --- | --- |
| Perfil | Existing `UserInfoCell`. |
| Categoría | Existing category badge. |
| Estado | Existing status badge with new `paused` label. |
| Última participación | Relative label + touch-friendly exact date. |
| Última aceptación de términos | Relative label + touch-friendly exact date. |
| Participaciones | Existing count, but preferably accepted real participations only. |
| Elegible para pausa | Badge: `Elegible`, `Activo reciente`, `Ya pausado`, `Vetado`, etc. |
| Fecha de verificación | Existing column. |
| Acciones | Add pause/unpause actions. |

Touch-friendly exact-date interaction:

- Use a small button in the cell that opens a popover.
- Button visible text: `5 meses atrás`.
- Popover content:
  - Festival name.
  - Exact date/time.
  - Status source: `Reserva aceptada` or `Términos aceptados`.

### 7.2 Profile requests page

Recommended route: `/dashboard/profile_requests`.

Alternative low-cost first step: add a saved filter link to `/dashboard/users?status=pending&status=rejected`.

Table columns:

- Perfil.
- Categoría.
- Estado: `pending` or `rejected`.
- Profile completion.
- Fecha de creación.
- Última actualización.
- Actions: verify, reject, edit categories, view profile.

### 7.3 Paused user messaging

When a paused user visits terms:

```text
Tu cuenta está pausada

Pausamos algunas cuentas durante una limpieza de participantes inactivos. Esto no es una sanción.
Si querés participar en un próximo festival, escribinos para solicitar la reactivación de tu cuenta.
```

The CTA should point to the current support/contact channel. If no channel exists in-app, use a mailto or WhatsApp link configured centrally.

---

## 8. Email Requirements

### 8.1 Account paused email

Create: `app/emails/account-paused.tsx`.

Subject:

```text
Tu cuenta de participante fue pausada
```

Body requirements:

- Explain this is a clean-up of inactive participant accounts.
- Explicitly say it is not a punishment or infraction.
- Explain paused accounts will not receive festival invitation emails or be able to accept festival terms.
- Explain they can request reactivation if they intend to participate in an upcoming festival.
- Mention that if they request reactivation and do not participate in the upcoming festival, the admin team may review the account more strictly.

Recommended sender:

```text
Perfiles Glitter <perfiles@productoraglitter.com>
```

### 8.2 Invitation email changes

Any action that sends festival participation invitation emails must exclude `paused` users.

Known area to inspect during implementation:

- `/dashboard/festivals/[id]/allowed_participants`
- `app/dashboard/festivals/[id]/allowed_participants/send-emails-form.tsx`
- `app/lib/festivals/actions.ts` participant bucket queries.

---

## 9. Data Model Implementation

### 9.1 Update enum

In `db/schema.ts`:

```ts
export const userStatusEnum = pgEnum("user_status", [
  "verified",
  "pending",
  "rejected",
  "banned",
  "paused",
]);
```

Migration:

```sql
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'paused';
```

Drizzle migration should also add the audit table.

### 9.2 Audit table

Add to schema:

```ts
export const userStatusEvents = pgTable("user_status_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fromStatus: userStatusEnum("from_status").notNull(),
  toStatus: userStatusEnum("to_status").notNull(),
  reason: text("reason"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Add relations from `users`:

- `statusEvents: many(userStatusEvents, { relationName: "targetUserStatusEvents" })`
- `createdStatusEvents: many(userStatusEvents, { relationName: "createdUserStatusEvents" })`

### 9.3 Query helper return shape

Create participant types in `app/lib/participants/definitions.ts`:

```ts
export type ParticipantActivitySummary = {
  lastParticipationAt: Date | null;
  lastParticipationFestivalName: string | null;
  lastTermsAcceptedAt: Date | null;
  lastTermsAcceptedFestivalName: string | null;
  acceptedParticipationsCount: number;
  acceptedTermsCount: number;
  isPauseEligible: boolean;
  pauseEligibilityReason: string;
};
```

For table rows, either extend `ProfileType`:

```ts
export type ParticipantProfile = ProfileType & {
  activitySummary: ParticipantActivitySummary;
};
```

or return a flattened select type if performance requires it.

---

## 10. Query Implementation

### 10.1 Participant list query

Add `fetchParticipantProfiles` and `fetchParticipantAggregates` in `app/lib/participants/actions.ts`.

Recommended approach:

- Reuse `buildWhereClauseForProfileFetching` for shared filters.
- Force participant status filtering to `verified`, `paused`, `banned`.
- Default to `verified`, `paused`.
- Add lateral subqueries or grouped subqueries for:
  - Last accepted reservation participation.
  - Last accepted festival terms request.
  - Counts.
  - Participation in latest 3 festivals.

SQL shape:

```sql
with festival_last_occurrence as (
  select
    festival_id,
    max(end_date) as last_occurrence_at,
    min(start_date) as first_start_at
  from festival_dates
  group by festival_id
),
latest_festivals as (
  select f.id
  from festivals f
  inner join festival_last_occurrence flo on flo.festival_id = f.id
  where f.status in ('published', 'active', 'archived')
    and flo.first_start_at <= now()
  order by flo.last_occurrence_at desc nulls last, f.id desc
  limit 3
),
participant_activity as (
  select
    p.user_id,
    max(coalesce(flo.last_occurrence_at, sr.updated_at)) filter (where sr.status = 'accepted') as last_participation_at,
    count(*) filter (where sr.status = 'accepted') as accepted_participations_count,
    bool_or(sr.festival_id in (select id from latest_festivals) and sr.status = 'accepted') as participated_recently
  from participations p
  join stand_reservations sr on sr.id = p.reservation_id
  join festivals f on f.id = sr.festival_id
  left join festival_last_occurrence flo on flo.festival_id = f.id
  group by p.user_id
),
terms_activity as (
  select
    ur.user_id,
    max(ur.created_at) filter (
      where ur.type = 'festival_participation' and ur.status = 'accepted'
    ) as last_terms_accepted_at,
    count(*) filter (
      where ur.type = 'festival_participation' and ur.status = 'accepted'
    ) as accepted_terms_count
  from user_requests ur
  group by ur.user_id
)
select ...
```

Festival names for the last participation and last terms acceptance can be fetched with lateral joins:

- Order accepted reservations by `sr.updated_at desc`.
- Order accepted terms by `ur.created_at desc`.
- Join `festivals` for `name`.

### 10.2 Sorting

Extend `/dashboard/users/schemas.tsx` sort enum if using the same page:

- `lastParticipationAt`
- `lastTermsAcceptedAt`

If the query uses computed fields, sorting should happen in SQL, not in the client.

### 10.3 Aggregates

Return:

```ts
type ParticipantAggregates = {
  total: number;
  active: number;
  paused: number;
  banned: number;
  pauseEligible: number;
};
```

---

## 11. Server Actions

### 11.1 Pause action

Add `pauseParticipantAccount(profileId: number, reason?: string)`.

Flow:

1. Load current admin profile.
2. Reject unless current profile is admin.
3. Load target user.
4. Reject unless target status is `verified`.
5. Run pause eligibility query.
6. Reject unless eligible.
7. In a transaction:
   - Update `users.status = paused`, `updatedAt = now()`.
   - Insert `user_status_events`.
8. Send account paused email after the transaction.
9. Revalidate relevant admin/profile routes.

Return shape:

```ts
type ActionResult = {
  success: boolean;
  message: string;
  description?: string;
};
```

### 11.2 Unpause action

Add `unpauseParticipantAccount(profileId: number, reason?: string)`.

Flow:

1. Require admin.
2. Load target user.
3. Reject unless status is `paused`.
4. In a transaction:
   - Update `users.status = verified`, `updatedAt = now()`.
   - Insert `user_status_events`.
5. Revalidate relevant routes.

No automatic email is required for MVP, but recommended.

---

## 12. Access Control and Flow Changes

Update all participant eligibility checks to distinguish active verified users from historical participants.

| Area | Required behavior |
| --- | --- |
| `protectRoute` | Keep verified-only for routes that mutate participant festival state. Consider allowing paused users to view read-only profile/history pages if needed. |
| Terms route | Block paused users before rendering terms acceptance UI. |
| `createUserEnrollment` | Require `profile.status === verified`; return paused-specific message. |
| Allowed participants page | Exclude paused and banned by default. |
| Invitation send action | Re-check `status = verified` before sending emails. |
| Reservation actions | Keep or add `status = verified` server checks. |
| Activity enrollment | Require `status = verified`. |
| Product submission | Require `status = verified`. |

---

## 13. UI Implementation Plan

### Phase 1: Data and labels

- Add `paused` to enum and migration.
- Add `user_status_events`.
- Add paused status label/badge in:
  - `ProfileStatusCell`
  - `profileStatusOptions`
  - any status filter maps.
- Add pause/unpause email template.

### Phase 2: Participant list

- Add participant-specific query and aggregate helpers.
- Update `/dashboard/users` title to `Participantes` or create `/dashboard/participants`.
- Default status filter to `verified` and `paused`.
- Add summary cards.
- Add last participation and last terms acceptance columns.
- Add pause eligibility badge and filter.
- Add exact-date popover cell component.

### Phase 3: Pause actions

- Add server actions for pause/unpause.
- Add action menu items in `ProfileQuickActions` or `ActionsCell`.
- Add confirmation dialogs.
- Send pause email.
- Revalidate participant pages.

### Phase 4: Profile requests split

- Create `/dashboard/profile_requests`, or add a clearly named dashboard nav item that links to the filtered users page.
- Show only `pending` and `rejected`.
- Preserve existing verification/rejection actions.

### Phase 5: Flow gating

- Block paused users from terms pages and `createUserEnrollment`.
- Exclude paused users from allowed participant invitation buckets and send actions.
- Audit reservation/activity/product flows for `verified` server checks.

---

## 14. Testing Plan

### Unit tests

- Pause eligibility helper:
  - User with accepted reservation in latest 3 festivals is not eligible.
  - User with accepted reservation older than latest 3 festivals is eligible.
  - User with only terms acceptance and no accepted reservation is eligible.
  - User with rejected/pending reservation is eligible.
  - Paused, banned, pending, rejected, admin users are not pause-eligible.
- Status grouping helper:
  - Participants: `verified`, `paused`, `banned`.
  - Profile requests: `pending`, `rejected`.

### Server action tests

- Non-admin cannot pause.
- Admin cannot pause ineligible verified user.
- Admin can pause eligible verified user.
- Pause action writes audit row.
- Pause action sends email.
- Admin can unpause paused user.
- Unpause action writes audit row.

### Integration/manual QA

- Participants page default view excludes pending, rejected, and banned.
- Banned users appear when banned filter is selected.
- Profile requests page excludes verified, paused, and banned.
- Last participation relative date and exact date render correctly on desktop and touch-sized viewport.
- Paused user cannot accept festival terms.
- Paused user does not receive festival invitation email from allowed participants flow.
- Unpaused user can accept terms again.

---

## 15. Rollout Plan

1. Ship schema migration and status labels.
2. Ship participants/profile requests split with read-only activity fields.
3. Validate participant counts with admins against current expectations.
4. Ship manual pause/unpause actions.
5. Ship paused-user flow gating and invitation exclusions.
6. Optionally add bulk pause after admins validate the eligibility rules with real data.

Recommended before enabling pause actions:

- Run a one-off report listing every eligible participant with:
  - last participation,
  - last terms acceptance,
  - accepted participation count,
  - accepted terms count,
  - latest 3 festivals considered by the rule.

---

## 16. Open Questions

- Should the global participants page route remain `/dashboard/users` or should a new `/dashboard/participants` route be introduced?
- What is the official contact channel for unpause requests: email, WhatsApp, or an in-app request form?
- Should paused users receive an email when unpaused?
- Should users who accepted terms in one of the last 3 festivals but never reserved a stand be eligible for pause? This PRD says yes, because only accepted reservations count as real participation.
- Should `festival_admin` accounts be excluded from participant counts like `admin` accounts?
- Should latest 3 festivals be calculated globally, or by festival type (`glitter`, `twinkler`, `festicker`)?

---

## 17. Implementation Checklist

- [ ] Add `paused` to `user_status` enum and schema.
- [ ] Add `user_status_events` table and relations.
- [ ] Add participant/profile-request status grouping helpers.
- [ ] Add participant activity query helpers.
- [ ] Add participant aggregates.
- [ ] Add paused badge/labels/filter option.
- [ ] Add last participation cell with touch-friendly exact date.
- [ ] Add last terms acceptance cell with touch-friendly exact date.
- [ ] Add pause eligibility badge/filter.
- [ ] Add account paused email template.
- [ ] Add `pauseParticipantAccount` server action.
- [ ] Add `unpauseParticipantAccount` server action.
- [ ] Add admin confirmation dialogs/actions.
- [ ] Split participants from profile requests in dashboard navigation.
- [ ] Block paused users from terms acceptance.
- [ ] Exclude paused users from invitation email flows.
- [ ] Add tests for grouping, eligibility, actions, and gating.
