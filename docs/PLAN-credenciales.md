# Implementation Plan: Credenciales del festival

**Product:** Glitter  
**Feature area:** Admin dashboard, festival operations  
**Status:** Approved for implementation  
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
| Live-activity stands | No special handling. They follow the rule of their stand category. |
| Same person on two reservations | Both reservations are counted in full. The names list shows a warning so an admin can decide by hand. |
| External participants | Counted per stand like everyone else (default 2), printed with the organization's `displayName`. The total can be overridden per external participant, per festival. |
| Volunteers | Read from accepted `volunteer_applications` of the festival: `fullName` plus the assigned role. Nothing to type. |
| Glitter team | New reusable roster (name + role), with a per-festival selection. Plus per-festival one-off entries. |
| Print tracking | "Marcar como enviadas a imprenta" records a batch. Afterwards each holder shows whether it is new, printed, short, over, or no longer applicable. |
| Batch selection | Starts with everything that still needs printing **under the page's current filters** (so with "Pendientes" on, pending reservations are pre-selected). People are added or removed by searching by name; the list of names is not shown by default. Already-printed holders can be added again as a reprint. Selection is per holder, not per credential. |
| Phone layout | Tabs scroll sideways inside their own box. The batch dialog becomes a bottom sheet, and search opens its own full-screen view. |
| Typography | No all-caps labels anywhere in this feature. |
| Feature flag | None. The page ships visible to `admin` and `festival_admin` as soon as it is deployed, and participant copy reads each festival's rules immediately (a festival without rules reads exactly today's strings). A `festival_credentials` flag was built first and removed before merge. |
| Who can use it | `admin` and `festival_admin` for everything, roster management included. Deleting a print batch is `admin` only. |

---

## 2. Glossary

| Term | Meaning |
| --- | --- |
| Credencial | A physical badge. Either **con nombre** (a name is printed) or **sin nombre** (generic, for a companion). |
| Holder | One row in the names list: a participant on a reservation, an external participant, a volunteer, a team member, or a one-off entry. |
| Group | How holders are grouped and ruled: `illustration`, `entrepreneurship`, `gastronomy`, `external`, `volunteer`, `staff`. |
| Active stand | A `stand_reservation_stands` row of the reservation with `released_at IS NULL`. |
| Titular | The reservation owner (`stand_reservations.owner_user_id`), the same person the reservation screens call "Titular". |
| Entitlement | What should exist right now according to the rules. |
| Unit | The thing print tracking follows. One per holder for named credentials, plus one per reservation for its unnamed credentials (section 6.2). |
| Batch | One "sent to print" event with a frozen copy of the units it included. |

---

## 3. Current state (what we are replacing)

- External tool `dennis-adrian/credentials-classifier` at commit `91a3792` (Vite, client only). Input: CSV with `category`, `participant`, `stand`. Its rules, in `src/utils/index.ts`:
  - illustration: 1 named per participant, plus 1 unnamed per stand that has exactly one participant;
  - entrepreneurship: 1 named and 1 unnamed per participant;
  - gastronomy: 2 named per participant, 0 unnamed.
- It reads one stand per CSV row, so a reservation with two stands is under-counted. It knows nothing about statuses, externals, volunteers or staff.
- In the app the same rules are hardcoded as participant-facing copy:
  - `app/components/festivals/stand-specifications-sector-card.tsx` (`servicesIncluded`, credential lines per category);
  - `app/components/payments/product-details.tsx` (`{2 * standCount} credenciales`).
- No table, page or action counts credentials today. The finance account `gastos:credenciales` is unrelated bookkeeping.

"2 per stand" reproduces all three old rules for single stands: illustration alone 1+1, illustration shared 2+0, entrepreneurship 1+1, gastronomy 2+0. To keep that claim checked inside this repository, copy the tool's `clasifyCredentials` function into the fixture of the parity test (section 12).

---

## 4. Calculation rules

All of this is one pure module, `app/lib/credentials/calculate.ts`, with no database, `server-only` or React imports, so the server page, the client toggles, the export and the tests share it. Anything it imports must itself be importable from a client component.

### 4.1 Reservations

For each counted reservation:

1. `stands` = its active stands, ordered by `stand_reservation_stands.position`. Zero active stands: skip the reservation and report it in `warnings`.
2. `group` = `standCategory` of the first active stand, passed through `profileCategoryForStandMatch` so the deprecated `new_artist` becomes `illustration`. The stand decides, not the user's profile category. `stands.standCategory` can also be `none` ("Ninguna" in the stand editor): such a reservation is ruled as `illustration` and reported in `warnings`.
3. If the reservation has external participants and no registered participants, it belongs to group `external` (section 4.2). A reservation with both kinds is ruled by its registered participants and reported in `warnings`; the app cannot create one today but the schema allows it.
4. `total = rule.quantity × stands.length`.
5. Order the participants: the titular first when that user is still a participant, then the rest by ascending `reservationParticipants.id`. Split by the group's naming mode:
   - `one_per_participant`: `named = min(participants, total)`, assigned one each in that order; `unnamed = total − named`.
   - `all_named`: `named = total`, `unnamed = 0`, split evenly across participants with any remainder on the first.
   - `none`: `named = 0`, `unnamed = total`.
6. The reservation's unnamed credentials are shown on the first participant's row, but they belong to the reservation, not to that person (section 6.2).
7. A participant who ends with 0 named credentials on a reservation with 0 unnamed (possible when a rule sets quantity below the participant count) is not a holder. They appear in the names list as "Sin credencial", have no print state and cannot be put in a batch.
8. Printed name = `getUserName(user)` (`displayName`, else first + last name). An empty name is a warning; the holder still counts.

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

- Holder = one external participant in the festival, reached through `reservation_external_participants`. Their reservations are created `accepted`, so the status toggles do not affect them in practice. The status filter selects the whole holder: it is counted when any of its reservations passes, with the entitlement of all of them, so its count and print state never depend on the toggles.
- Default entitlement = `rule(external).quantity × active stands`, summed only over that participant's reservations classified `external` in 4.1 step 3. All named with `displayName`.
- An override row (section 5) replaces that total for the festival while the participant still has at least one counted reservation. The row remembers how many stands the participant had when it was saved; if that number changes later, the Equipo tab shows "Cambió la cantidad de espacios" next to the field so the admin re-checks it.

### 4.3 Volunteers

- Holder = one `volunteer_applications` row with `status = 'accepted'` for the festival.
- Entitlement = `rule(volunteer).quantity` named (default 1), printed with `fullName`. The role shown is `volunteer_roles.name` through `assignedRoleId`, or "Sin rol" when null.

### 4.4 Glitter team and one-off entries

- Team holder = a roster member with a `festival_staff_members` row for the festival. Nothing else decides it: archiving a member does not remove them from festivals where they are already selected. Entitlement = `rule(staff).quantity` named (default 1), printed with the roster name and role.
- One-off entry = either a named person (quantity 1) or a labelled lot of unnamed credentials (for example "Prensa", 6). These are not ruled; they count exactly what was typed.

### 4.5 Warnings the calculator returns

Shown as a short notice on the Nombres tab; none of them blocks anything.

- The same user appears in more than one counted reservation of the festival. Both are counted.
- A reservation has no active stands, or no participants and no external participant.
- A reservation has both registered and external participants.
- A stand has no category ("Espacio sin categoría").
- A holder's printed name is empty.
- A participant's `users.status` is `banned`.

---

## 5. Data model

One migration, `drizzle/0322_credentials.sql` generated with `pnpm generate` from `db/schema.ts` (numbered after develop's `0321_add_stamp_card_activity_type`). Conventions follow `finance_festival_settings` and the volunteers tables: snake_case plural tables, `created_at` / `updated_at` with `defaultNow()`, festival FKs `ON DELETE cascade`, actor FKs `ON DELETE set null`, constraints prefixed with the table name, JSDoc on each table, a `relations()` block per table and a `many(...)` added to `festivalsRelations`.

New enums:

- `credential_group`: `illustration`, `entrepreneurship`, `gastronomy`, `external`, `volunteer`, `staff`.
- `credential_naming_mode`: `one_per_participant`, `all_named`, `none`.

New tables:

| Table | Columns | Notes |
| --- | --- | --- |
| `festival_credential_rules` | `festival_id`, `group`, `quantity` smallint, `naming_mode` (nullable), `updated_by_user_id`, `updated_at` | PK (`festival_id`, `group`). Check `quantity BETWEEN 0 AND 20`. `naming_mode` is only meaningful for the three category groups. No row = code default. |
| `festival_external_credential_overrides` | `festival_id`, `external_participant_id`, `quantity` smallint, `stands_at_override` smallint, `updated_by_user_id`, `updated_at` | PK (`festival_id`, `external_participant_id`). Both FKs cascade. Check `quantity BETWEEN 0 AND 50`. |
| `staff_members` | `id`, `full_name`, `role_label`, `is_active` (default true), timestamps | Global roster. Checks on text length (name 1–120, role up to 80). Not linked to `users`. |
| `festival_staff_members` | `festival_id`, `staff_member_id`, `created_at` | PK both. Both FKs cascade. Presence of a row = "works this edition". |
| `festival_extra_credentials` | `id`, `festival_id`, `name` (nullable), `label`, `quantity` smallint (default 1), timestamps | `name` set = one named credential and a check forces `quantity = 1`. `name` null = `quantity` unnamed credentials under `label`. |
| `credential_print_batches` | `id`, `festival_id`, `note` (nullable, up to 200), `rules` jsonb, `created_by_user_id`, `created_at` | One row per "sent to print" event. `rules` is the resolved rule set used for that batch. Unique (`id`, `festival_id`) so items can reference it festival-scoped. |
| `credential_print_batch_items` | `id`, `batch_id`, `festival_id`, `unit_key`, `group`, `user_id` (nullable, no FK), `printed_name` (nullable), `detail`, `named_count`, `unnamed_count`, `is_reprint` (default false) | Frozen copy of the unit at that moment. Composite FK (`batch_id`, `festival_id`) → `credential_print_batches` `ON DELETE cascade`, named `credential_print_batch_items_batch_festival_fk`, the same pattern as `0318_volunteer_festival_scoped_fks`. Index on (`festival_id`, `unit_key`). Unique on (`batch_id`, `unit_key`). |

`unit_key` is a plain string and deliberately has no FK to what it names, because the history must survive that thing disappearing — a cancelled reservation is exactly the case the page has to show:

- `participant:<reservationParticipantId>` — the participation row id, not the user id. A participation keeps its id when it is transferred to the same person's new account (`participant-transfer-service.ts` rewrites `user_id` in place), so the badge stays "printed".
- `reservation:<reservationId>` — the reservation's unnamed credentials.
- `external:<externalParticipantId>`
- `volunteer:<volunteerApplicationId>`
- `staff:<staffMemberId>`
- `extra:<festivalExtraCredentialId>`

Notes:

- The Drizzle object for participants is `reservationParticipants` (SQL table `participations`).
- The roster table is named `staff_members`, not "team" or "collaborators", because `collaborators` already means the helpers participants register for their own stand. The interface says "Equipo Glitter".
- `DEFAULT_CREDENTIAL_RULES` in code may only change together with a migration that writes the old defaults as explicit rule rows for every festival that already has batches. Otherwise finished festivals would be re-ruled retroactively.

Applying the migration is Dennis's call. Development and tests use `pnpm migrate:test` only.

---

## 6. Server layer

New folder `app/lib/credentials/`, modelled on the admin side of volunteers (`app/lib/volunteers/admin-*.ts`):

| File | Role |
| --- | --- |
| `definitions.ts` | Types (`CredentialGroup`, `CredentialRules`, `CredentialHolder`, `CredentialSummary`, `PrintState`), `DEFAULT_CREDENTIAL_RULES`, group labels, Spanish copy (`CREDENTIALS_COPY`), `credentialsPath(festivalId)`, `CredentialsResult`, the search-param parser, and `credentialRuleCopy(rule)` which turns a rule into the sentence shown to admins and participants. Shared by server and client. |
| `calculate.ts` | Pure: `resolveRules(rows)`, `buildHolders(data, rules)`, `applyPrintState(holders, batchItems)`, `buildView(data, rules, filters)`, `summarize(view)`. |
| `schema.ts` | zod input schemas for every action, each exported as schema + `z.input` type. |
| `queries.ts` | `import "server-only"`. All reads, always scoped by `festivalId`. Returns `null` when the festival does not exist. |
| `actions.ts` | `"use server"`. All writes. |
| `export.ts` | Pure CSV serializer and filename builder, on top of `serializeCsvRows` from `app/lib/orders/csv.ts`. |
| `load-page.ts` | `import "server-only"`. `loadCredentialsPage(rawId)`: auth and id parsing. (Not `page.ts`: Next routes any `page.ts` under `app/`.) |
| `participant-rules.ts` | `import "server-only"`. `fetchParticipantCredentialRules(festivalId)` for the participant-facing copy (section 9). |

### 6.1 Reads

`fetchCredentialsData(database, festivalId)` takes the database handle as its first argument, with no default, so the batch action can pass its `tx` (see `docs/PLAN-database-reliability-hardening.md` §2: calling the module-level `db` inside a transaction takes a second connection from a pool of 5 and can deadlock). It returns plain data:

1. One joined read of reservations with status in `accepted`, `verification_payment`, `pending`: `stand_reservations` (`id`, `status`, `ownerUserId`) inner-joined to `stand_reservation_stands` (`position`, with `released_at IS NULL`) and `stands` (`id`, `label`, `standNumber`, `standCategory`). Stands are counted from the membership table, never from the legacy `stand_reservations.stand_id`.
2. Participants of those reservations: `reservationParticipants.id`, `reservationId`, and from `users` `id`, `displayName`, `firstName`, `lastName`, `status`.
3. External participants of those reservations: `id`, `displayName`, `type`, `customCategoryLabel`.
4. Accepted volunteer applications with the assigned role name (same join as `fetchVolunteerApplicationsForExport`).
5. The roster with a selected flag, one-off entries, rule rows, external overrides.
6. Batches and their items.

From the page, run at most three statements at a time. From inside a transaction, await them one after another. `buildHolders` must tolerate a participant row whose reservation is missing, because the reads are separate statements.

All three statuses are always loaded (a few hundred rows at most). The status and group toggles are applied by the pure calculator, so they respond instantly in the browser without another request.

Do not reuse `fetchReservationsByFestivalId`: it loads invoices, payments, socials and scheduled tasks that this page does not need.

Stand labels use `formatStandLabel`; two stands render as "A14 y A15" through `summarizeReservationStands`.

### 6.2 Print state

Print tracking follows **units**. A registered participant's named credentials are one unit (`participant:<id>`); a reservation's unnamed credentials are a separate unit (`reservation:<id>`). Keeping them apart means a partner joining or leaving a shared stand never moves already-printed unnamed credentials from one person's row to another. In the names list the reservation unit is drawn on the first participant's row, and selecting that person for a batch includes it. Every other holder kind is a single unit.

For each unit, `coverage` = the sum of its non-reprint batch items, compared with the current entitlement separately for named and unnamed. An item printed under a different name than the unit's previous item resets coverage to that item's counts, reprint or not: the earlier copies carry the old name.

| State | Condition | Badge |
| --- | --- | --- |
| `new` | No non-reprint items, entitlement above zero | "Nueva" (amber) |
| `printed` | Coverage equals the entitlement | "Impresa el 14 nov" (green), date of the last item in `America/La_Paz` |
| `partial` | Coverage is below the entitlement (a stand was added, a rule was raised) | "Faltan 2" (amber) |
| `surplus` | Coverage is above the entitlement but the unit still exists (a stand was released, a rule was lowered) | "Sobran 2" (outline) |
| `stale` | Items exist and the unit is gone (reservation cancelled, volunteer no longer accepted, team member unticked) | "Ya no corresponde" (red) |

Rules that keep this consistent:

- `applyPrintState` always runs on the holders built from **all three statuses and all groups**. Filters are applied afterwards. `stale` means absent from the unfiltered set, so a printed pending reservation does not turn "Ya no corresponde" just because the "Pendientes" toggle is off.
- The page and the export route both call `buildView(data, rules, filters)`, so they cannot disagree.
- Stale units are not in the live data; they are rebuilt from their batch items.
- If the name stored in a unit's last item differs from the current printed name, the unit is `partial` with its whole entitlement missing (the copies out there carry the old name), never `surplus`, and the row shows "Cambió el nombre" (amber) instead of "Faltan" or "Sobran". The next batch sends that full entitlement under the new name as a reprint, so a rename that comes with a raise or a cut is printed whole and the badge clears. This covers an admin replacing the partner on a reservation (`admin-service.ts` rewrites the participation's `user_id` to a different person).
- A row's badge is the most urgent of its units, in the order `stale`, `partial`, `new`, `surplus`, `printed`.

### 6.3 Writes

Every action follows the shape of `app/lib/volunteers/admin-actions.ts`:

1. `const profile = await requireAdminOrFestivalAdmin(); if (!profile) return UNAUTHORIZED;`
2. zod `safeParse`, returning the first issue's message.
3. `db.transaction(async (tx) => …)` that passes `tx` down. Refusals inside the transaction throw a local `Refusal` error.
4. A local `failure()` maps `Refusal` to its message, `isImpersonationReadOnlyError` to the shared read-only result, and anything else to a logged generic message through `loggableError`.
5. `revalidatePath("/(site)/dashboard/festivals/[id]/credentials", "layout")`.
6. Return `CredentialsResult` = `{ success: true; message } | { success: false; message }`.

| Action | What it does |
| --- | --- |
| `saveCredentialRules` | Upserts the rule rows of a festival. A row is deleted only when both its quantity and its naming mode equal the default. Takes `pg_advisory_xact_lock(hashtext('festival_credential_rules'), festivalId)`, so two saves cannot interleave into a rule set nobody submitted. |
| `resetCredentialRules` | Deletes the festival's rule rows, under the same lock. |
| `setExternalCredentialQuantity` | Upserts or deletes one override and stores `stands_at_override`. Refuses an external participant that has no counted reservation in the festival. |
| `createStaffMember`, `updateStaffMember`, `archiveStaffMember`, `restoreStaffMember` | Roster maintenance. Archive sets `is_active = false`; rows are never deleted. |
| `setFestivalStaffMember` | Ticks or unticks one roster member for the festival. Refuses ticking an archived member; unticking is always allowed. |
| `addExtraCredential`, `updateExtraCredential`, `removeExtraCredential` | One-off entries. Update keeps the id, so raising "Prensa" from 6 to 8 shows "Faltan 2" instead of 8 new. The name of a named entry cannot be edited. |
| `createCredentialPrintBatch` | Input: `festivalId`, `lastBatchId` (the latest batch the dialog was opened on, null for none), `holders[]` (`key`, and the `name`, `named`, `unnamed` and `reprint` the dialog showed and exported), `note`. See below. |
| `deleteCredentialPrintBatch` | Removes the most recent batch of the festival only, for undoing a mistake. `admin` only. Takes the same lock as create. |

`createCredentialPrintBatch`, inside one transaction:

1. Takes `pg_advisory_xact_lock(hashtext('credential_print_batches'), festivalId)` so two admins cannot record the same unit twice. Do not reuse `lockFestivalRow`; it is the reservation flow's throughput ceiling.
2. Calls `fetchCredentialsData(tx, festivalId)` and recomputes holders and print state from live data. Counts come from the server, never from the client.
3. Refuses the batch when the festival's latest batch (by `created_at`, then `id`, as undo orders it) is no longer `lastBatchId`: another batch was recorded or undone meanwhile, so even matching counts may be a second copy of the same reprint. Refuses any key that is not a current holder, and any holder whose entitlement is zero. Refuses the whole batch when a holder's recomputed name, counts or reprint flag differ from what the client sent, so what is recorded is what was exported to the printer, and a stale screen or a second admin cannot record a reprint nobody saw.
4. Writes the items of each selected holder (`batchItemsFor`). A holder that needs printing sends only its units that do (new, short or renamed) and leaves its printed units out; a holder with nothing left to print sends every unit as a reprint. An item stores only what this batch sends:
   - renamed ("Cambió el nombre"), whatever its state: the full entitlement under the current name with `is_reprint = true`;
   - `new`: the full entitlement;
   - `partial`: `max(0, entitlement − coverage)`, computed separately for named and unnamed;
   - `printed` or `surplus`: the full entitlement with `is_reprint = true`.
5. Stores the resolved rules in `credential_print_batches.rules`, and sets `created_at` to `clock_timestamp()`, taken after the lock, so batches sort in the order they were recorded (the print history and "undo the latest" both order by it).

---

## 7. Screens and routes

| Route | Purpose | Mockup |
| --- | --- | --- |
| `/dashboard/festivals/[id]/credentials` | The page. The tab comes from `?tab=` (`resumen` default, `nombres`, `equipo`, `reglas`). | M1–M4, M6 |
| `/dashboard/festivals/[id]/credentials/export` | CSV download (`GET`). Accepts the same status and group params as the page. | — |

`page.tsx` is an async server component. It exports `metadata = { title: "Credenciales" }`, awaits `params` and `searchParams` (both are Promises in this Next version), calls `loadCredentialsPage`, then `fetchCredentialsData(db, festivalId)`, and renders the header, the tab links and one view. Add `loading.tsx` with a skeleton.

`export/route.ts` does its own gating, like `volunteers/export/route.ts`: `requireAdminOrFestivalAdmin` (401 "No autorizado"), then zod params (404). It answers with a UTF-8 BOM, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment` and `Cache-Control: private, no-store`. Filename `credenciales-<slug|id>-<yyyy-MM-dd>.csv` with the date in `America/La_Paz`.

Header (all tabs): breadcrumb through `PageBreadcrumbs`, `<h1 data-installed-title="">Credenciales</h1>` (so the installed app does not show the title twice), subtitle, and two actions — "Exportar CSV" (a link styled as an outline button) and "Marcar como enviadas a imprenta" (primary).

### 7.1 Tabs

Link-based tabs like `app/components/comunicados/admin/comunicados-tabs.tsx`: an allow-list parser, `<Link scroll={false} aria-current>`, inside an `overflow-x-auto` nav so they scroll sideways on a phone and the page never does.

### 7.2 Resumen (M1, M6)

- Three tiles: total, con nombre, sin nombre. `StatTile` renders its label in uppercase with no way to turn it off, so either add a `labelCase` prop to it (default unchanged) or use a small local tile. No uppercase here.
- A notice with what changed since the last batch: how many are new or short, how many are over, how many no longer apply. Hidden when there is no batch yet.
- "Desglose por grupo": one row per group with its rule in words (`credentialRuleCopy`), people, named, unnamed, total, and a totals row. A table from `md` up, a stacked list on phones.
- "Qué se cuenta": a disabled, checked "Confirmadas"; checkboxes for "En verificación de pago" and "Pendientes", each with its reservation count; switches for externals, volunteers and team. These are client state mirrored to the URL (`?estados=` and `?grupos=`) with `router.replace(…, { scroll: false })`, so a filtered view can be shared and the export link carries the same filters. They are not saved to the database.
- "Última impresión": date, how many were sent, and the counts by state since then.

### 7.3 Nombres (M2)

- `DataTable` (`app/components/ui/data_table/data-table`) in browser mode with `renderMobileRow` for phones.
- Columns: nombre en la credencial (with a second line such as "Comparte con …" or "2 espacios, 4 credenciales"), espacio, reserva (status badge), con nombre, sin nombre, impresión.
- Filters: search, group, print state.
- "Copiar nombres" copies the visible named holders one per line, repeating a name once per named credential (so a gastronomy name appears twice). This is the old tool's main use, kept. The count sits beside the button, not in its label. Pass `toastLabel` to `CopyToClipboardButton` (for example "128 nombres copiados"): its default toast echoes the whole copied text.
- The warnings of section 4.5 appear above the table when there are any.

### 7.4 Equipo y externos (M3)

- "Equipo Glitter": roster table with a checkbox per person for this edition (immediate save, optimistic, like `volunteer-setup-active-toggle.tsx`), "Agregar persona" and "Editar" in a `DrawerDialog`. Archived members appear only if they are selected for this festival, with an "Archivada" badge, and can be unticked.
- "Solo para esta edición": the one-off entries, with add, edit and remove. Removing an entry that is already in a batch warns first.
- "Participantes externos": one row per external participant with a number field for the total. Saving on blur; clearing the field returns to the default.
- "Voluntarios": read-only counts (accepted, without a role, waiting) and a link to the volunteers section.

### 7.5 Reglas (M4)

- One block per category: "Credenciales por espacio" (number) and "Cuáles llevan nombre" (select with the three naming modes).
- "Otros grupos": quantity for external (per stand), volunteer and team.
- A side card previews the totals with the values being edited, computed in the browser by the same pure calculator.
- "Guardar reglas" and "Volver a los valores por defecto". This is a form saved with a button (react-hook-form + zod, `app/components/ui/form`), not immediate.

### 7.6 Marcar como enviadas a imprenta (M5, M7, M8)

One client organism, `print-batch-dialog.tsx`, in a `DrawerDialog` with `useMediaQuery("(min-width: 768px)")` as `isDesktop`.

- Title with the live count: "Marcar 8 credenciales como enviadas a imprenta".
- Summary by group with a total line, and a link "Exportar estas N en CSV" that builds the file in the browser from the current selection with `serializeCsvRows`.
- Initial selection: every holder with a unit in state `new` or `partial` (or with a changed name) under the page's current status and group filters. `surplus`, `printed` and `stale` are never pre-selected.
- "Quitar o sumar a alguien":
  - desktop: an inline search field; matching holders appear only while there is text, each with a checkbox, its group, stand and counts, and its print badge;
  - phone: a row that opens the full-screen search. `MobileSearchScreen` does not close itself (the caller does), but it is built for picking one option: it clears the search text on every select, has no selected state on its options, its only header button is "Cancelar" (which also resets), and its rows are buttons inside a listbox, so a checkbox cannot be nested in them. Extend it with opt-in props that leave `partner-selection.tsx` unchanged — keep the search text after a select, mark rows as selected (`aria-selected` plus a check mark drawn through `renderOption`), and a configurable dismiss label ("Listo") that does not reset. If that grows awkward, build a small dedicated search screen on the same vaul `Drawer` instead.
- Search ignores case and accents and looks across every group.
- "Cambios a mano": holders removed from the default selection ("Quitada de este lote. Seguirá como nueva") and already-printed holders added ("Sumada para reimprimir"), each with an undo.
- Optional note.
- Footer: "Cancelar" and "Marcar como enviadas" in one row, never stacked. On the phone sheet the footer is pinned and the content scrolls.

### 7.7 Responsive rules

Per `AGENTS.md`: every screen must work from 320px. Names, organization names and role labels wrap (`break-words`, `wrap-anywhere` for single-word names); buttons whose label carries a number or name use `wrap`; text columns beside fixed-width siblings get `min-w-0`; tables sit in `overflow-x-auto`.

---

## 8. Components

### Reuse as-is

`Card`, `Badge` (category variants `illustration`, `entrepreneurship`, `gastronomy` match the enum values), `Button`, `Checkbox`, `Switch`, `Input`, `Label`, `Select`, `Alert`, `Form`, `DataTable`, `DrawerDialog`, `PageBreadcrumbs`, `toast` from sonner, `toastActionError`, `formatDisplayDate`, `formatStandLabel`, `summarizeReservationStands`.

Group labels come from `definitions.ts`, not from `getCategoryLabel`: two different functions share that name, and the one in `app/lib/maps/helpers.ts` says "Emprendimiento Creativo" and "Sin nombre" for unknown categories.

### Change

- `MobileSearchScreen`: opt-in multi-select behaviour (section 7.6).
- `StatTile`: optional `labelCase`, or do not use it (section 7.2).
- `CopyToClipboardButton`: used with `toastLabel`; no code change needed.

### New, under `app/components/festivals/credentials/`

`credentials-tabs.tsx`, `credentials-header.tsx`, `credentials-summary-view.tsx`, `credentials-sources-card.tsx`, `credentials-breakdown.tsx`, `credentials-names-view.tsx`, `credentials-team-view.tsx`, `staff-member-dialog.tsx`, `extra-credential-dialog.tsx`, `external-quantity-field.tsx`, `credentials-rules-form.tsx`, `print-batch-dialog.tsx`, `print-state-badge.tsx`. Tests sit next to each as `*.test.tsx`.

---

## 9. Navigation and participant copy

### Section and title

- **Section entry** in `app/components/festivals/festival-sections.ts`: key `credentials`, label "Credenciales", description "Cuántas producir y con qué nombres", `IdCardIcon`, group `participants`, path `credentials`, placed after `volunteers`. It shows wherever festival sections do (festival page, festivals list menu, staff sidebar) with no extra plumbing.
- **Screen title** in `app/components/navbar/screens.ts`: `` [`${FEST}/credentials`]: { title: "Credenciales", parent: FEST } ``.

### No feature flag

The feature ships ungated. A `festival_credentials` flag (with flag-aware section visibility threaded through the festival page, the dashboard viewer context and the sidebar) was built first and removed before merge: it had no use in production. Access is `requireAdminOrFestivalAdmin` on the page, every action and the export route.

### Participant-facing copy

Both hardcoded places read the festival's rules through `fetchParticipantCredentialRules(festivalId)`, which resolves the festival's rule rows over `DEFAULT_CREDENTIAL_RULES`. A festival without rules of its own reads exactly today's strings; saving rules on the Reglas tab changes what its participants read.

- `stand-specifications-sector-card.tsx` is a client component. Fetch the rules on the server and pass a serializable object down `app/components/pages/profiles/festivals/terms.tsx` → `app/components/festivals/terms.tsx` → `stand-specifications-cards.tsx` → the card. The credential lines come from `credentialRuleCopy`, so the admin page and the participant page cannot drift. With default rules the output must equal today's strings exactly.
- `product-details.tsx` replaces `2 * standCount` with `rule.quantity * standCount`, with the rules passed in by its two callers.

The festival terms document is one global, editor-managed text. It mentions credentials in general terms and is not touched.

---

## 10. Implementation phases

Each phase leaves the app working. What each one shows is spelled out, because the mockups show the finished page.

### Phase 0 — Contracts

- Read the relevant guides in `node_modules/next/dist/docs/` before writing routes or actions, as `AGENTS.md` requires.
- `definitions.ts` with types, defaults and copy; the section entry; the screen title.

### Phase 1 — Schema, calculator, queries

- Schema and migration `0322` (all tables at once).
- `calculate.ts` without print state: `resolveRules`, `buildHolders`, `buildView`, `summarize`, with unit tests including the parity test against the old tool.
- `queries.ts` and its integration test.

### Phase 2 — Resumen, Nombres, export

- The page with two tabs only (`resumen`, `nombres`), default rules, the status toggles and the externals and volunteers switches, copy names, and the CSV route.
- Not yet: the print button, the print column and filter, the "since last print" notice, the "Última impresión" card, the team switch.
- Dev seed (section 12).
- At the end of this phase the page replaces the external tool for participants, externals and volunteers.

### Phase 3 — Reglas and participant copy

- The `reglas` tab, rules form and actions.
- `fetchParticipantCredentialRules` and the two participant-facing components.

### Phase 4 — Equipo y externos

- The `equipo` tab: roster, per-festival selection, one-off entries, external overrides. The team switch appears on Resumen.

### Phase 5 — Print batches

- `applyPrintState` and its tests, the batch actions, badges and the print filter on Nombres, the header button, the dialog, the phone sheet and search screen, the notice and the "Última impresión" card.

### Phase 6 — Hardening

- Storybook stories for the four views and the dialog (`stories/credentials/`, action mock registered in `.storybook/preview.tsx`).
- Optional figure on the "Gestionar" card (`FestivalOverviewCounts` in `app/lib/festivals/overview.ts` + `sectionFigure`).
- Dennis checks a real festival against the old tool after deploy.
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

- `calculate.test.ts`:
  - every row of the table in section 4.1;
  - parity with the old tool: its `clasifyCredentials` copied into the fixture, run on single-stand data, totals equal;
  - rule overrides, each naming mode, quantity below the participant count (who gets the badge, who is "Sin credencial");
  - titular ordering, including an owner who is not a participant;
  - `new_artist` and `none` stand categories;
  - external-only reservation, mixed reservation, external with an override and with a changed stand count;
  - volunteers with and without a role; archived-but-selected staff; extras;
  - every warning;
  - filters applied after print state; page and export parity through `buildView`;
  - print states: print 2, grow to 4, top up, grow to 6 → "Faltan 2"; stand released → "Sobran"; partner joins a printed solo stand; participation transferred to a new account stays printed; partner replaced → "Cambió el nombre"; a renamed holder whose entitlement grew is reprinted whole and clears; a renamed surplus clears once reprinted; reprints do not count as coverage; a printed pending reservation with the toggle off is not stale.
- `schema.test.ts`: bounds and refusals of every input schema.
- `export.test.ts`: header, row order, formula neutralisation, filename, and the route's 401 and bad-id 404.
- Component tests: sources card (URL sync), rules form, names view (copy text repeats names per named credential), header (`data-installed-title`), batch dialog (default selection, search with accents, undo, live totals, buttons in one row).
- Update `festival-sections.test.ts` (new key, after Voluntarios), `app-navigation.test.ts` (Credenciales in the staff sidebar, after Voluntarios), and `stand-specifications-sector-card.test.tsx` / `product-details.test.tsx` (rule-driven copy; default rules give today's exact strings).

**Integration (`pnpm db:test:up && pnpm migrate:test && pnpm test:integration`)**

- `queries.integration.test.ts`: released stand members are ignored; a two-stand reservation counts two; excluded statuses never appear; data from another festival never leaks.
- `actions.integration.test.ts`: rules upsert and reset; override on an external without a reservation is refused; ticking an archived staff member is refused; batch creation recomputes counts server-side, refuses unknown and zero-entitlement keys, writes deltas for partial units; refuses a batch whose counts, reprint flag or holder name changed since the dialog showed them; two concurrent creates for the same holder record one batch and refuse the other; two admins reprinting the same holder record one reprint; a dialog opened before an undo is refused; two concurrent rule saves and a reset leave one whole rule set; an item cannot point at a batch of another festival; unauthorized calls are refused; impersonation read-only is surfaced.
- Both files must be added by hand to the `test:integration` list in `package.json`, or they will not run.

**Dev seed**

The current seed has no volunteers, no external participants and nothing for the new tables, so three of the six groups would be empty locally. Add `scripts/seed/credentials.ts`, called from the main seed with the same dev-only gate and idempotent: accepted volunteer applications with and without a role, one external participant with a reservation, one two-stand reservation, and (from phases 4 and 5) two staff members, one one-off entry and one print batch. Mention it under "Development seed" in `AGENTS.md`.

**Manual**

- Walk every screen at 320, 390 and 1280 wide against the mockups, including the phone search screen with the keyboard open on a real device.
- Dennis: compare the Resumen totals of one past festival with what the old tool gives for the same data, single-stand reservations only.

---

## 13. Assumptions to confirm

These were chosen during design and not explicitly confirmed. None blocks implementation.

1. External participants default to 2 credentials per stand, all with the organization's name.
2. An already-printed holder can be put in a new batch as a reprint.
3. One-off entries ("Solo para esta edición") exist at all; they were added during design for press and guests.

---

## 14. File touch list (expected)

**New**

- `drizzle/0322_credentials.sql` and its snapshot
- `app/lib/credentials/` — `definitions.ts`, `calculate.ts`, `schema.ts`, `queries.ts`, `actions.ts`, `export.ts`, `load-page.ts`, `participant-rules.ts`, their tests, and `__mocks__/actions.ts` for Storybook
- `app/(site)/dashboard/festivals/[id]/credentials/` — `page.tsx`, `loading.tsx`, `export/route.ts`
- `app/components/festivals/credentials/*` (section 8)
- `scripts/seed/credentials.ts`
- `stories/credentials/*`

**Changed**

- `db/schema.ts`
- `app/components/festivals/festival-sections.ts` (and its test), `app/components/navbar/screens.ts`, `app/components/navbar/app-navigation.test.ts`
- `app/components/ui/mobile-search-screen.tsx`, `app/components/molecules/stat-tile.tsx` (if the prop route is taken)
- `app/components/festivals/stand-specifications-sector-card.tsx`, `stand-specifications-cards.tsx`, `app/components/festivals/terms.tsx`, `app/components/pages/profiles/festivals/terms.tsx`
- `app/components/payments/product-details.tsx` and its two callers
- `scripts/seed.ts` (or the seed entry point), `AGENTS.md`
- `.storybook/preview.tsx` (register the action mock)
- `package.json` (`test:integration` list)
