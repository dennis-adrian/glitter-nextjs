# Implementation Plan: Credenciales del festival

**Product:** Glitter  
**Feature area:** Admin dashboard, festival operations  
**Status:** Proposed  
**Last updated:** 2026-11-25  
**Mockups:** https://claude.ai/artifact/KMMng4zEeJBVYihh6WPopF (8 screens, referred to below as M1–M8)

This plan moves the standalone `credentials-classifier` tool into the app. Today an admin exports a CSV of participants, uploads it to that tool, and reads how many named and unnamed credentials to produce per category. The new page at `/dashboard/festivals/[id]/credentials` computes the same thing from live data, and adds what the tool never had: reservations in other statuses, reservations with two stands, external participants, volunteers, the Glitter team, per-festival rules, and a record of what was already sent to print.

---

## 1. Decisions locked

| Topic | Decision |
| --- | --- |
| Where it lives | `/dashboard/festivals/[id]/credentials`, listed in the "Gestionar" card and the "Festival en curso" sidebar, group `participants`, after Voluntarios. |
| Core rule | Credentials are counted **per stand**: `quantity × active stands of the reservation`. Default quantity is 2 in every category. A reservation holding two stands gets 4. There is no special case for "full table" and none for gastronomy. |
| Which carry a name | Per category, one of: **one per participant, rest unnamed** (default for illustration and entrepreneurship) or **all, with the participant's name** (default for gastronomy). |
| Rules | Editable per festival. Defaults live in code and equal the old tool's behaviour. No row in the database means "use the default". |
| Reservation statuses | `accepted` ("Confirmada") always counts. `verification_payment` and `pending` are optional toggles. `rejected`, `cancelled` and `released` never count. |
| External participants | Counted per stand like everyone else (default 2), printed with the organization's `displayName`. The total can be overridden per external participant, per festival. |
| Volunteers | Read from accepted `volunteer_applications` of the festival: `fullName` plus the assigned role. Nothing to type. |
| Glitter team | New reusable roster (name + role), with a per-festival selection. Plus per-festival one-off entries. |
| Print tracking | "Marcar como enviadas a imprenta" records a batch. Afterwards each holder shows as new, printed, or no longer applicable. |
| Batch selection | Starts with everything new. People are added or removed by searching by name; the list of names is not shown by default. Already-printed holders can be added again as a reprint. Selection is per holder, not per credential. |
| Phone layout | Tabs scroll sideways inside their own box. The batch dialog becomes a bottom sheet, and search opens its own full-screen view. |
| Typography | No all-caps labels anywhere in this feature. |
| Who can use it | `admin` and `festival_admin`, same as Voluntarios. |

---

## 2. Glossary

| Term | Meaning |
| --- | --- |
| Credencial | A physical badge. Either **con nombre** (a name is printed) or **sin nombre** (generic, for a companion). |
| Holder | One row in the names list: a participant on a reservation, an external participant, a volunteer, a team member, or a one-off entry. A holder owns some named and some unnamed credentials. |
| Group | How holders are grouped and ruled: `illustration`, `entrepreneurship`, `gastronomy`, `external`, `volunteer`, `staff`. |
| Active stand | A `stand_reservation_stands` row of the reservation with `released_at IS NULL`. |
| Entitlement | What a holder should have right now according to the rules. |
| Batch | One "sent to print" event with a frozen copy of the holders it included. |

---

## 3. Current state (what we are replacing)

- External tool `dennis-adrian/credentials-classifier` (Vite, client only). Input: CSV with `category`, `participant`, `stand`. Its rules, in `src/utils/index.ts`:
  - illustration: 1 named per participant, plus 1 unnamed per stand that has exactly one participant;
  - entrepreneurship: 1 named and 1 unnamed per participant;
  - gastronomy: 2 named per participant, 0 unnamed.
- It reads one stand per CSV row, so a reservation with two stands is under-counted. It knows nothing about statuses, externals, volunteers or staff.
- In the app the same rules are hardcoded as participant-facing copy:
  - `app/components/festivals/stand-specifications-sector-card.tsx` (`servicesIncluded`, credential lines per category);
  - `app/components/payments/product-details.tsx` (`{2 * standCount} credenciales`).
- No table, page or action counts credentials today. The finance account `gastos:credenciales` is unrelated bookkeeping.

"2 per stand" reproduces all three old rules for single stands: illustration alone 1+1, illustration shared 2+0, entrepreneurship 1+1, gastronomy 2+0.

---

## 4. Calculation rules

All of this is one pure module, `app/lib/credentials/calculate.ts`, with no database or React imports, so the server page, the client toggles, the export and the tests share it.

### 4.1 Reservations

For each counted reservation:

1. `stands` = its active stands (section 6.1). Zero active stands: skip the reservation and report it in `warnings`.
2. `group` = `standCategory` of the active stand with the lowest `position`, passed through `profileCategoryForStandMatch` so the deprecated `new_artist` becomes `illustration`. The stand decides, not the user's profile category.
3. If the reservation has external participants and no registered participants, it belongs to group `external` (section 4.2).
4. `total = rule.quantity × stands.length`.
5. Split by the group's naming mode:
   - `one_per_participant`: `named = min(participants, total)`, `unnamed = total − named`. Each participant holds 1 named. The unnamed ones are attached to the participant with the lowest `participations.id` (the "titular" row in the list).
   - `all_named`: `named = total`, `unnamed = 0`, split evenly across participants with any remainder on the first.
   - `none`: `named = 0`, `unnamed = total`, attached to the first participant.
6. Printed name = `getUserName(user)` (`displayName`, else first + last name). An empty name is a warning; the holder still counts.

Worked results with the defaults:

| Case | Con nombre | Sin nombre |
| --- | --- | --- |
| Illustration, one participant, one stand | 1 | 1 |
| Illustration, two participants, one stand | 2 | 0 |
| Illustration, one participant, two stands | 1 | 3 |
| Illustration, two participants, two stands | 2 | 2 |
| Entrepreneurship, one stand | 1 | 1 |
| Entrepreneurship, two stands | 1 | 3 |
| Gastronomy, one stand | 2 | 0 |
| Gastronomy, two stands | 4 | 0 |

### 4.2 External participants

- Holder = one external participant in the festival, reached through `reservation_external_participants`. Their reservations are created `accepted`, so the status toggles do not affect them.
- Default entitlement = `rule(external).quantity × active stands` summed over that participant's reservations in the festival, all named with `displayName`.
- An override row (section 5) replaces that total for the festival.

### 4.3 Volunteers

- Holder = one `volunteer_applications` row with `status = 'accepted'` for the festival.
- Entitlement = `rule(volunteer).quantity` named (default 1), printed with `fullName`. The role shown is `volunteer_roles.name` through `assignedRoleId`, or "Sin rol" when null.

### 4.4 Glitter team and one-off entries

- Team holder = a roster member selected for the festival. Entitlement = `rule(staff).quantity` named (default 1), printed with the roster name and role.
- One-off entry = either a named person (quantity 1) or a labelled lot of unnamed credentials (for example "Prensa", 6). These are not ruled; they count exactly what was typed.

### 4.5 Warnings the calculator returns

Shown as a short notice on the Nombres tab; none of them blocks anything.

- The same user appears in more than one counted reservation of the festival (possible through admin assignment or transfers). Both are counted.
- A reservation has no active stands, or no participants and no external participant.
- A holder's printed name is empty.
- A participant's `users.status` is `banned`.

---

## 5. Data model

One migration, `drizzle/0321_credentials.sql`, generated with `pnpm generate` from `db/schema.ts`. Conventions follow `finance_festival_settings` and the volunteers tables: snake_case plural tables, `created_at` / `updated_at` with `defaultNow()`, festival FKs `ON DELETE cascade`, actor FKs `ON DELETE set null`, constraints prefixed with the table name, a `relations()` block per table and a `many(...)` added to `festivalsRelations`.

New enums:

- `credential_group`: `illustration`, `entrepreneurship`, `gastronomy`, `external`, `volunteer`, `staff`.
- `credential_naming_mode`: `one_per_participant`, `all_named`, `none`.

New tables:

| Table | Columns | Notes |
| --- | --- | --- |
| `festival_credential_rules` | `festival_id`, `group`, `quantity` smallint, `naming_mode` (nullable), `updated_by_user_id`, `updated_at` | PK (`festival_id`, `group`). Check `quantity BETWEEN 0 AND 20`. `naming_mode` is only meaningful for the three category groups. No row = code default. |
| `festival_external_credential_overrides` | `festival_id`, `external_participant_id`, `quantity` smallint, `updated_by_user_id`, `updated_at` | PK (`festival_id`, `external_participant_id`). Both FKs cascade. Check `quantity BETWEEN 0 AND 50`. |
| `staff_members` | `id`, `full_name`, `role_label`, `is_active` (default true), timestamps | Global roster. Checks on text length (names 1–120, role up to 80). Not linked to `users`. |
| `festival_staff_members` | `festival_id`, `staff_member_id`, `created_at` | PK both. Both FKs cascade. Presence of a row = "works this edition". |
| `festival_extra_credentials` | `id`, `festival_id`, `name` (nullable), `label`, `quantity` smallint (default 1), timestamps | `name` set = one named credential and the check forces `quantity = 1`. `name` null = `quantity` unnamed credentials under `label`. |
| `credential_print_batches` | `id`, `festival_id`, `note` (nullable, up to 200), `created_by_user_id`, `created_at` | One row per "sent to print" event. |
| `credential_print_batch_items` | `id`, `batch_id`, `festival_id`, `holder_key`, `group`, `printed_name` (nullable), `detail`, `named_count`, `unnamed_count`, `is_reprint` (default false) | Frozen copy of the holder at that moment. Index on (`festival_id`, `holder_key`). Unique on (`batch_id`, `holder_key`). `batch_id` cascades. |

`holder_key` is a plain string and deliberately has no FK to the holder, because the history must survive the holder disappearing — a cancelled reservation is exactly the case the page has to show:

- `participant:<reservationId>:<userId>`
- `external:<externalParticipantId>`
- `volunteer:<volunteerApplicationId>`
- `staff:<staffMemberId>`
- `extra:<festivalExtraCredentialId>`

The roster table is named `staff_members`, not "team" or "collaborators", because `collaborators` already means the helpers participants register for their own stand. The interface says "Equipo Glitter".

Applying the migration is Dennis's call. Development and tests use `pnpm migrate:test` only.

---

## 6. Server layer

New folder `app/lib/credentials/`, mirroring `app/lib/volunteers/`:

| File | Role |
| --- | --- |
| `definitions.ts` | Types (`CredentialGroup`, `CredentialRules`, `CredentialHolder`, `CredentialSummary`, `PrintState`), `DEFAULT_CREDENTIAL_RULES`, group labels, Spanish copy (`CREDENTIALS_COPY`), `credentialsPath(festivalId)`, `CredentialsResult`, and the search-param parser. Shared by server and client. |
| `calculate.ts` | Pure: `resolveRules(rows)`, `buildHolders(input, rules)`, `summarize(holders, filters)`, `applyPrintState(holders, batchItems)`. |
| `schema.ts` | zod input schemas for every action, each exported as schema + `z.input` type. |
| `queries.ts` | `import "server-only"`. All reads, always scoped by `festivalId`. Returns `null` when the festival does not exist. |
| `actions.ts` | `"use server"`. All writes. |
| `export.ts` | Pure CSV serializer and filename builder, on top of `serializeCsvRows` from `app/lib/orders/csv.ts`. |
| `page.ts` | `import "server-only"`. `loadCredentialsPage(rawId)`: auth, id parsing, feature flag, festival lookup. |

### 6.1 Reads

`fetchCredentialsData(festivalId)` runs these in parallel and returns plain data:

1. Reservations with status in `accepted`, `verification_payment`, `pending`, inner-joined to `stand_reservation_stands` with `released_at IS NULL` and to `stands` (`id`, `label`, `standNumber`, `standCategory`, `position`). Stands are counted from the membership table, never from the legacy `stand_reservations.stand_id`.
2. Participants of those reservations: `participations.id`, `reservationId`, and from `users` `id`, `displayName`, `firstName`, `lastName`, `status`.
3. External participants of those reservations: `id`, `displayName`, `type`, `customCategoryLabel`.
4. Accepted volunteer applications with the assigned role name (same join as `fetchVolunteerApplicationsForExport`).
5. Selected staff members, and the full roster for the Equipo tab.
6. One-off entries, rule rows, external overrides.
7. Batches and their items.

All three statuses are always loaded (a few hundred rows at most). The status and group toggles are applied by the pure calculator, so they respond instantly in the browser without another request.

Do not reuse `fetchReservationsByFestivalId`: it loads invoices, payments, socials and scheduled tasks that this page does not need.

Stand labels use `formatStandLabel`; two stands render as "A14 y A15" through `summarizeReservationStands`.

### 6.2 Print state per holder

`applyPrintState` compares the current entitlement with the sum of that holder's non-reprint batch items:

| State | Condition | Badge |
| --- | --- | --- |
| `new` | No items | "Nueva" (amber) |
| `printed` | Items cover the current entitlement | "Impresa el 14 nov" (green), date of the last item |
| `partial` | Items exist but the entitlement grew (a stand or participant was added, or a rule changed) | "Faltan 2" (amber) |
| `stale` | Items exist but the holder is no longer entitled (reservation cancelled, volunteer no longer accepted, team member unticked) | "Ya no corresponde" (red) |

Stale holders are not in the live data, so they are rebuilt from their batch items. If the printed name stored in the last item differs from the current name, the row also shows "Cambió el nombre".

### 6.3 Writes

Every action follows the volunteers shape: `requireAdminOrFestivalAdmin()`, `featureFlagGuard`, zod `safeParse`, a `db.transaction` that receives and passes down `tx`, `revalidatePath("/(site)/dashboard/festivals/[id]/credentials", "layout")`, and a `CredentialsResult` of `{ success, message }`. Errors go through a local `failure()` that maps `isImpersonationReadOnlyError` to the shared read-only result and logs with `loggableError`.

| Action | What it does |
| --- | --- |
| `saveCredentialRules` | Upserts the rule rows of a festival. A value equal to the default deletes the row. |
| `resetCredentialRules` | Deletes the festival's rule rows. |
| `setExternalCredentialQuantity` | Upserts or deletes one override. Refuses an external participant that has no reservation in the festival. |
| `createStaffMember`, `updateStaffMember`, `archiveStaffMember` | Roster maintenance. Archive sets `is_active = false`; rows are never deleted so batch history keeps its meaning. |
| `setFestivalStaffMember` | Ticks or unticks one roster member for the festival. |
| `addExtraCredential`, `removeExtraCredential` | One-off entries. |
| `createCredentialPrintBatch` | Input: `festivalId`, `holderKeys[]`, `includedStatuses[]`, `note`. Inside one transaction it recomputes the holders from live data, refuses any key that is not a current holder, and writes the batch with one item per key. Counts come from the server, never from the client. A holder already fully printed is stored with `is_reprint = true`. |
| `deleteCredentialPrintBatch` | Removes the most recent batch only, for undoing a mistake. Admin only. |

---

## 7. Screens and routes

| Route | Purpose | Mockup |
| --- | --- | --- |
| `/dashboard/festivals/[id]/credentials` | The page. The tab comes from `?tab=` (`resumen` default, `nombres`, `equipo`, `reglas`). | M1–M4, M6 |
| `/dashboard/festivals/[id]/credentials/export` | CSV download (`GET`). Accepts the same status and group params as the page. | — |

`page.tsx` is an async server component: `loadCredentialsPage`, then `fetchCredentialsData`, then it renders the header, the tab links and one view. Add `loading.tsx` with a skeleton.

Header (all tabs): breadcrumb through `PageBreadcrumbs`, `h1` "Credenciales", subtitle, and two actions — "Exportar CSV" (a link styled as an outline button) and "Marcar como enviadas a imprenta" (primary).

### 7.1 Tabs

Link-based tabs like `comunicados-tabs.tsx`: an allow-list parser, `<Link scroll={false} aria-current>`, inside an `overflow-x-auto` nav so they scroll sideways on a phone and the page never does.

### 7.2 Resumen (M1, M6)

- Three stat tiles: total, con nombre, sin nombre.
- A notice with what changed since the last batch: how many are new and how many no longer apply. Hidden when there is no batch yet.
- "Desglose por grupo": one row per group with its rule in words, people, named, unnamed, total, and a totals row. A table from `md` up, a stacked list on phones.
- "Qué se cuenta": a disabled, checked "Confirmadas"; checkboxes for "En verificación de pago" and "Pendientes", each with its reservation count; switches for externals, volunteers and team. These are client state mirrored to the URL (`?estados=` and `?grupos=`) with `router.replace`, so a filtered view can be shared and the export link carries the same filters. They are not saved to the database.
- "Última impresión": date, how many were sent, new since then, no longer applicable.

### 7.3 Nombres (M2)

- `DataTable` in browser mode with `renderMobileRow` for phones.
- Columns: nombre en la credencial (with a second line such as "Comparte con …" or "2 espacios, 4 credenciales"), espacio, reserva (status badge), con nombre, sin nombre, impresión.
- Filters: search, group, print state.
- "Copiar N nombres" copies the visible named holders one per line, repeating a name once per named credential (so a gastronomy name appears twice). This is the old tool's main use, kept.
- The warnings of section 4.5 appear above the table when there are any.

### 7.4 Equipo y externos (M3)

- "Equipo Glitter": roster table with a checkbox per person for this edition (immediate save, optimistic, like `volunteer-setup-active-toggle.tsx`), "Agregar persona" and "Editar" in a `DrawerDialog`.
- "Solo para esta edición": the one-off entries, with add and remove.
- "Participantes externos": one row per external participant with a number field for the total. Saving on blur; clearing the field returns to the default.
- "Voluntarios": read-only counts (accepted, without a role, waiting) and a link to the volunteers section.

### 7.5 Reglas (M4)

- One block per category: "Credenciales por espacio" (number) and "Cuáles llevan nombre" (select with the three naming modes).
- "Otros grupos": quantity for external (per stand), volunteer and team.
- A side card previews the totals with the values being edited, computed in the browser by the same pure calculator.
- "Guardar reglas" and "Volver a los valores por defecto". This is a form saved with a button (react-hook-form + zod), not immediate.

### 7.6 Marcar como enviadas a imprenta (M5, M7, M8)

One client organism, `print-batch-dialog.tsx`, in a `DrawerDialog` with `useMediaQuery("(min-width: 768px)")`.

- Title with the live count: "Marcar 8 credenciales como enviadas a imprenta".
- Summary by group with a total line, and a link "Exportar estas N en CSV" that builds the file in the browser from the current selection with `serializeCsvRows`.
- Initial selection: every holder in state `new` or `partial` under the page's current status and group filters.
- "Quitar o sumar a alguien":
  - desktop: an inline search field; matching holders appear only while there is text, each with a checkbox, its group, stand and counts, and its print badge;
  - phone: a row that opens `MobileSearchScreen`. That component closes on select today, so it needs a small opt-in (`closeOnSelect={false}` or equivalent) to act as a multi-toggle list with a "Listo" button. The field stays pinned at the top and results sit above the keyboard.
- Search ignores case and accents and looks across every group.
- "Cambios a mano": holders removed from the default selection ("Quitada de este lote. Seguirá como nueva") and already-printed holders added ("Sumada para reimprimir"), each with an undo.
- Optional note.
- Footer: "Cancelar" and "Marcar como enviadas" in one row. On the phone sheet the footer is pinned.

### 7.7 Responsive rules

Per `AGENTS.md`: every screen must work from 320px. Names, organization names and role labels wrap (`break-words`, `wrap-anywhere` for single-word names); buttons whose label carries a number or name use `wrap`; text columns beside fixed-width siblings get `min-w-0`; tables sit in `overflow-x-auto`.

---

## 8. Components

### Reuse as-is

`Card`, `Badge` (category variants match the enum values), `Button`, `Checkbox`, `Switch`, `Input`, `Label`, `Select`, `Alert`, `Form`, `DataTable`, `DrawerDialog`, `StatTile`, `CopyToClipboardButton`, `PageBreadcrumbs`, `toast` from sonner, `toastActionError`, `formatDisplayDate`, `getCategoryLabel`, `formatStandLabel`, `summarizeReservationStands`.

### Change

- `MobileSearchScreen`: opt-in to stay open on select (section 7.6).
- `InfoHint`: used here too; move it from `app/components/festivals/finance/` to a shared folder only if it is actually needed.

### New, under `app/components/festivals/credentials/`

`credentials-tabs.tsx`, `credentials-header.tsx`, `credentials-summary-view.tsx`, `credentials-sources-card.tsx`, `credentials-breakdown.tsx`, `credentials-names-view.tsx`, `credentials-team-view.tsx`, `staff-member-dialog.tsx`, `extra-credential-dialog.tsx`, `external-quantity-field.tsx`, `credentials-rules-form.tsx`, `print-batch-dialog.tsx`, `print-state-badge.tsx`.

---

## 9. Navigation, feature flag and participant copy

- **Section entry** in `app/components/festivals/festival-sections.ts`: key `credentials`, label "Credenciales", description "Cuántas producir y con qué nombres", icon `IdCardIcon`, group `participants`, path `credentials`, placed after `volunteers`.
- **Screen title** in `app/components/navbar/screens.ts`: `` [`${FEST}/credentials`]: { title: "Credenciales", parent: FEST } ``.
- **Feature flag** `festival_credentials` in `app/lib/feature_flags/registry.ts`, `defaultVisibility: "hidden"`. The page calls `requireFeatureEnabled`; every action calls `featureFlagGuard`. The database row is created on first read.
- **Hiding the link while the flag is off**: `FestivalSection` gets an optional `featureFlag` field and `visibleFestivalSections` an `enabledFlags` option. Its three callers pass it: `festival-sections-nav.tsx`, `festival-actions-menu.tsx` and `app-navigation.ts` (through `nav-flags.ts`).
- **Participant-facing copy** (phase 3): both hardcoded places read the festival's rules.
  - `stand-specifications-sector-card.tsx` is a client component with no festival data beyond `sector.festivalId`. Fetch the resolved rules on the server and pass a serializable object down `profiles/festivals/terms.tsx` → `festivals/terms.tsx` → `stand-specifications-cards.tsx` → the card. The credential lines are generated from the rule by one helper in `definitions.ts`, so the admin page and the participant page cannot drift.
  - `product-details.tsx` replaces `2 * standCount` with `rule.quantity * standCount`.
- The festival terms document is one global, editor-managed text. It mentions credentials in general terms and is not touched.

---

## 10. Implementation phases

Each phase is shippable behind the flag.

### Phase 0 — Contracts

- `definitions.ts` with types, defaults and copy; the flag; the section entry with flag-aware visibility; the screen title.
- Read the relevant guides in `node_modules/next/dist/docs/` before writing routes or actions, as `AGENTS.md` requires.

### Phase 1 — Schema, calculator, queries

- Schema and migration `0321`.
- `calculate.ts` with full unit tests, including a parity test against the old tool's three rules.
- `queries.ts` and its integration test.

### Phase 2 — Resumen, Nombres, export

- The page, tabs, Resumen and Nombres with default rules, the status and group toggles, copy names, and the CSV route.
- At the end of this phase the page fully replaces the external tool for participants, externals and volunteers.

### Phase 3 — Reglas and participant copy

- Rules form and actions.
- Wire the rules into the stand specifications card and the payment product details.

### Phase 4 — Equipo y externos

- Roster, per-festival selection, one-off entries, external overrides.

### Phase 5 — Print batches

- Batch tables in use, `applyPrintState`, badges and filters, the dialog, the phone sheet and search screen, the "since last print" notice.

### Phase 6 — Hardening

- Storybook stories for the four views and the dialog.
- Optional figure on the "Gestionar" card (`FestivalOverviewCounts` + `sectionFigure`).
- Turn the flag to `admin_only`, verify against a real festival, then `public`.
- Archive the `credentials-classifier` repository.

---

## 11. Non-goals

- Designing or generating the printable credential artwork or PDFs.
- QR codes on credentials, check-in by credential, or any link to attendance.
- Printing companion names from `collaborators`. Unnamed credentials stay generic.
- Showing a participant their own credential count beyond the two existing copy locations.
- Per-festival access control for `festival_admin`; the role is global today.
- Changing the festival terms text.

---

## 12. Test plan

**Unit (vitest, next to the code)**

- `calculate.test.ts`: every row of the table in section 4.1; rule overrides; `min(participants, total)` when quantity is below the participant count; `new_artist` stands; a reservation with only an external participant; an external with an override; volunteers with and without a role; every warning; status and group filters; all four print states plus the name-changed flag; reprints not counting as coverage.
- `schema.test.ts`: bounds and refusals of every input schema.
- `export.test.ts`: header, row order, formula neutralisation, filename, and the route's 401 and 404 paths.
- Component tests for the sources card (URL sync), the rules form, the names view (copy text repeats names per named credential) and the batch dialog (default selection, search with accents, undo, live totals).
- Update `festival-sections.test.ts` for the new key and flag behaviour, `stand-specifications-sector-card.test.tsx` and `product-details.test.tsx` for rule-driven copy.

**Integration (`pnpm db:test:up && pnpm migrate:test && pnpm test:integration`)**

- `queries.integration.test.ts`: released stand members are ignored; a two-stand reservation counts two; excluded statuses never appear; data from another festival never leaks.
- `actions.integration.test.ts`: rules upsert and reset; override on an external without a reservation is refused; batch creation recomputes counts server-side and refuses unknown keys; unauthorized and flag-off calls are refused; impersonation read-only is surfaced.
- Both files must be added by hand to the `test:integration` list in `package.json`, or they will not run.

**Manual**

- Compare the Resumen totals of one past festival against what the old tool gives for the same CSV, single-stand reservations only; the numbers must match.
- Walk every screen at 320, 390 and 1280 wide, including the phone search screen with the keyboard open on a real device.

---

## 13. Open questions

1. **Same person on two reservations.** Counted twice with a warning. Should they get one named credential in total instead?
2. **Live-activity stands** (`participationType = live_activity`). They are ruled by their stand category like any other. Is that right, or do they need their own group?
3. **Default selection of a batch** follows the page's current filters, so with "Pendientes" switched on, unpaid reservations go to print. Should the batch default to confirmed only regardless of the filters?
4. **Roster management** (adding and archiving team members) is open to `festival_admin` too. Restrict it to `admin`?
5. **Unnamed credentials and print state** are attached to the first participant of the reservation. If that participant leaves a shared reservation after printing, the row shows "Ya no corresponde" for credentials that are physically fine. Acceptable?

---

## 14. File touch list (expected)

**New**

- `drizzle/0321_credentials.sql` and its snapshot
- `app/lib/credentials/` — `definitions.ts`, `calculate.ts`, `schema.ts`, `queries.ts`, `actions.ts`, `export.ts`, `page.ts`, their tests, and `__mocks__/actions.ts` for Storybook
- `app/(site)/dashboard/festivals/[id]/credentials/` — `page.tsx`, `loading.tsx`, `export/route.ts`
- `app/components/festivals/credentials/*` (section 8)
- `stories/credentials/*`

**Changed**

- `db/schema.ts`
- `app/lib/feature_flags/registry.ts`
- `app/components/festivals/festival-sections.ts`, `festival-sections-nav.tsx`, `festival-actions-menu.tsx`
- `app/components/navbar/app-navigation.ts`, `nav-flags.ts`, `screens.ts`
- `app/components/ui/mobile-search-screen.tsx`
- `app/components/festivals/stand-specifications-sector-card.tsx`, `stand-specifications-cards.tsx`, `app/components/festivals/terms.tsx`, `app/components/pages/profiles/festivals/terms.tsx`
- `app/components/payments/product-details.tsx` and its two callers
- `.storybook/preview.tsx` (register the action mock)
- `package.json` (`test:integration` list)
