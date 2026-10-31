# Implementation: comunicados and distribution lists (phase 3)

**Status:** Built behind the hidden `comunicados` flag, 2026-10-26; not yet released. PRs 2 and 3 merged on their own (#603, #604); PRs 4–8 shipped together in one pull request (#605). Where the code settled a detail this design left open or got wrong, the implementation notes at the end of §J say what it does.
**PRD:** §12 of [`docs/PRD-in-app-notifications.md`](PRD-in-app-notifications.md)

This is the technical design behind §12 of [`docs/PRD-in-app-notifications.md`](PRD-in-app-notifications.md): comunicados (admin-written announcements) and distribution lists. §12 holds the decisions agreed with Dennis on 2026-10-24. Decisions 1–9 are binding here and are cited as "decision N", by their number there. Its defaults 10–24 are proposed, not decided: each is asked here as a K question, with its default number. "PRD §n" is a section of that PRD. Citations are `file:line` in the repo, checked against develop at `bf067e1b`.

---

## A. Data model

### A0. The migration rule

**Why the rule exists.**

- Drizzle applies every pending migration file in **one** transaction (`node_modules/drizzle-orm/pg-core/dialect.js:60-71`, called at `scripts/migrate.ts:156`).
- A production release that bundles several phase 3 PRs therefore applies 0301–0303 together, though each preview applied them one at a time.
- Postgres refuses to use a label added with `ALTER TYPE … ADD VALUE` before that transaction commits. `scripts/migrate.ts:69-108` already works around this twice.

**The rule, for every phase 3 migration:**

1. No DDL or DML may reference a label that a phase 3 migration adds with `ADD VALUE`. That covers CHECKs, partial-index predicates, defaults and backfills. Such labels are used only by runtime code.
2. New state machines get new types, created whole with `CREATE TYPE`. Their labels are usable in the same transaction, as 0300 did with `notification_delivery_channel`.
3. **Guard test:** `drizzle/enum-labels.test.ts` (PR 2). For files ≥ 0301 it scans `drizzle/*.sql` for `ADD VALUE( IF NOT EXISTS)? '([^']+)'` and fails when that label appears, as a whole word, inside any string literal of a later statement (so `'{x,y}'` array literals count). A trailing `-- comment` after a semicolon still ends a statement.
   - `IF NOT EXISTS` is the form the repo's hand-written migrations use (`drizzle/0255_terminal_reservation_payment_settlement_backfill.sql:69-70`).
   - A label equal to an existing label of another enum is a false positive: `'announcements'` is also a `notification_category` label (`db/schema.ts:7098-7101`). A line comment `-- enum-labels: existing <type> '<label>'` on that statement allows that one label; any other new label the statement uses is still caught.
4. **Tables are altered in the order the app locks them.** `notify()` and the gift paths take `notifications` before `notification_deliveries`, so a migration that alters both alters `notifications` first; otherwise a live `notify()` and the migration's transaction can deadlock during a deploy. `0301` puts its `notifications` columns right after the type statements. 0303 needs `users` and `notification_campaigns` (foreign keys) and `notification_campaign_recipients` (a column), so it begins with `LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`, then `notification_campaigns` in the same mode, then `notification_campaign_recipients IN ACCESS EXCLUSIVE MODE`: a profile deletion takes `users` before its cascades reach the campaign tables, and the gift paths take the campaign before its recipients. Applied on its own, 0303 then has one remaining window, which no order closes: a transaction holding a `users` row `FOR UPDATE` before writing `users` (a profile deletion, a status change), a gift creation or completion that checks that row's key (as a recipient or as the sender), and the migration. Any of the three may be aborted with `40P01`: a build fails and a redeploy retries; the others report an error and can be repeated. **A release that applies 0301 together with 0303 has a second window**: 0301 locks `notifications` first, while the gift worker takes recipients before `notify()`, and a profile deletion takes `notifications` before its cascades, so the code serving during the deploy holds these tables in both orders and no statement order avoids both. Ship 0301 and 0302 to production before 0303 when possible. (Locking the campaign tables at the top of 0301 was tried and reverted: it traded the gift window for a deletion window.) A release applying 0301–0303 together was tested on a database at 0300.
5. **A migration never queues the site behind a long transaction.**
   - Bulk sends hold `ACCESS SHARE` locks across a Resend call (D3).
   - The build runs `pnpm migrate` while the old deployment serves (`package.json:25`), and nothing bounds a migration's lock wait.
   - So `scripts/migrate.ts` sets `lock_timeout = '5s'` on its own connections, with `pool.on("connect", …)` attached at the top of `main()`, before any use of the pool. pg-pool reuses the idle clients that the earlier helpers (`catalogMigrationPending`, the backfill checks, `ensureFestivalTermsArchivedEnum`) already opened, and their `connect` event has already fired, so a listener added just before `migrate(db, …)` would never run.
   - A migration that cannot get its lock fails the build. The old deployment keeps serving, and redeploying retries. Without the timeout, every reader of that table would wait behind the `ALTER`.

| Migration (PR)                         | New types                                        | Labels added to existing types                                                                   | Tables and columns                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0301_bulk_lane` (PR 2)                | `notification_delivery_lane`                     | `email_topic`: `announcements`                                                                   | On `notification_deliveries`: `lane`, `batch_key`, `maybe_sent_at`, `content_revision`, their CHECKs and 2 indexes. On `notifications`: `edited_at`, `retracted_at` and a CHECK. |
| `0302_distribution_lists` (PR 3)       | `distribution_list_kind`                         | none                                                                                             | `distribution_lists`, `distribution_list_members` (no `stand_reservations` index: A3)                                                                                            |
| `0303_comunicados` (PR 4)              | `comunicado_status`, `campaign_recipient_source` | `notification_campaign_type`: `comunicado`; `notification_campaign_recipient_status`: `notified` | `comunicados` (with `autosave_key`), `comunicado_revisions`, `notification_campaign_recipients.source`                                                                           |
| `0304_comunicados_autosave_key` (PR 4) | none                                             | none                                                                                             | `comunicados.autosave_key`, `ADD COLUMN IF NOT EXISTS`: 0303 gained the column after an earlier version of it had run on preview databases                                       |

PRs 5–8 need no migration. A migration that has run anywhere is never edited again: a change ships as a new file, as 0304 does.

### A1. `notification_deliveries` (0301)

```sql
CREATE TYPE notification_delivery_lane AS ENUM ('transactional', 'bulk');
ALTER TABLE notification_deliveries
  ADD COLUMN lane notification_delivery_lane NOT NULL DEFAULT 'transactional',  -- metadata-only on PG >= 11
  ADD COLUMN batch_key text,
  ADD COLUMN maybe_sent_at timestamp,
  ADD COLUMN content_revision integer;
ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_batch_is_bulk_email
    CHECK (batch_key IS NULL OR (lane = 'bulk' AND channel = 'email')),
  ADD CONSTRAINT notification_deliveries_maybe_sent_has_batch
    CHECK (maybe_sent_at IS NULL OR batch_key IS NOT NULL),
  ADD CONSTRAINT notification_deliveries_revision_is_bulk
    CHECK (content_revision IS NULL OR lane = 'bulk');
CREATE INDEX notification_deliveries_bulk_due_idx ON notification_deliveries (next_attempt_at, id)
  WHERE lane = 'bulk' AND status IN ('pending', 'processing');
CREATE INDEX notification_deliveries_batch_key_idx ON notification_deliveries (batch_key)
  WHERE batch_key IS NOT NULL;
```

`'bulk'` belongs to the type this same migration creates, which is allowed. `'pending'` and `'processing'` are old labels.

**What each column means:**

- **`lane`.** `transactional` is the default for every existing writer. Only `notifyMany` (D2) and "Reintentar fallidos" (G6) write `bulk`.
- **`batch_key`.** The Resend idempotency key of the batch the row is in.
  - It is minted and committed in the claim, before any request carries it.
  - It is never given to other rows.
  - It is cleared only after a definite refusal, and only while no attempt under it may have landed (D3).
- **`maybe_sent_at`.** The first moment an attempt under the row's key may have reached Resend: an unknown outcome, or a claim or an expiry that found the previous attempt unsettled. Once it is set, the row:
  - keeps its key;
  - is never re-batched under a new key;
  - is never picked by "Reintentar fallidos";
  - may end `sent`, `failed` (`outcome_unknown` or `resend:<code>`, or the pre-check's `address_changed`) or `skipped` by the pre-check;
  - two exceptions: a 200 whose `errors[]` names the row, in an answer that adds up, proves it was not delivered, so it becomes `failed` `resend:item_rejected` with `maybe_sent_at` cleared, and can be retried; and a retraction skips `pending` rows as `retracted` directly (F3 step 4), maybe-sent ones included;
  - shows in the report as "Puede haber llegado" unless it is `sent` (G6).
- **`content_revision`.** The comunicado revision carried by the request Resend accepted (200). It is null after a 409 replay, which records `last_error = 'idempotent_replay'`.

| Row                         | `lane` | `template_key` | `payload`             | `idempotency_key`                                                                                |
| --------------------------- | ------ | -------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| Comunicado email            | `bulk` | `comunicado`   | `{"comunicadoId": k}` | `notification:{nid}:email`                                                                       |
| Comunicado push             | `bulk` | `comunicado`   | `{}`                  | `notification:{nid}:push:{psId}`                                                                 |
| "Reintentar fallidos" email | `bulk` | `comunicado`   | `{"comunicadoId": k}` | `notification:{nid}:email:retry:{uuid}`, with `resend_of_delivery_id` and `requested_by_user_id` |

- A comunicado email's payload is only the id: the email renders from the revision that is current when its batch is sent (D3).
- A push renders from the inbox row when it is sent, as every push does (`app/lib/notifications/push/payload.ts:64-98`).

### A2. `notifications` (0301)

```sql
ALTER TABLE notifications ADD COLUMN edited_at timestamp, ADD COLUMN retracted_at timestamp;
ALTER TABLE notifications ADD CONSTRAINT notifications_retracted_is_archived
  CHECK (retracted_at IS NULL OR archived_at IS NOT NULL);
```

- **Retraction sets both columns.** Every read already hides archived rows:
  - `visibleTo` (`app/lib/notifications/queries.ts:62-72`), and through it the list, the count, the detail page and the open route (`[notificationId]/open/route.ts:73-74`);
  - mark-all (`app/lib/notifications/actions.ts:107`);
  - the unread partial index (`db/schema.ts:7231-7233`);
  - the push skip `archived` (`push/send.ts:195`).
- **Undo is closed.**
  - The CHECK stops the archive toast's "Deshacer" (`notification-item-menu.tsx:82`, through `actions.ts:79-82`) from bringing a retracted row back.
  - `updateOne` (`actions.ts:43-59`), `markNotificationRead` (`app/lib/notifications/read.ts:20-31`) and `markNotificationsUnreadAction` (`actions.ts:120-138`, the "Deshacer" after "Marcar todo como leído") gain `isNull(notifications.retractedAt)`. A stale client then updates nothing, instead of raising an error or changing a retracted row's read state.
- **No `DELETE`.** `notification_deliveries.notification_id` cascades (`db/schema.ts:7298-7300`), so a delete would erase the report.
- **`edited_at`** marks "Editado" on rows rewritten after someone could have seen them (F1).

### A3. Distribution lists (0302)

```sql
CREATE TYPE distribution_list_kind AS ENUM ('filter', 'fixed');

CREATE TABLE distribution_lists (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,                                   -- <= 200, admins only
  kind distribution_list_kind NOT NULL,               -- immutable: the update action never writes it
  filter jsonb,                                       -- DistributionListFilterV1 (B3)
  created_by_user_id int REFERENCES users ON DELETE SET NULL,
  updated_by_user_id int REFERENCES users ON DELETE SET NULL,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT distribution_lists_filter_per_kind CHECK ((kind = 'filter') = (filter IS NOT NULL)),
  CONSTRAINT distribution_lists_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX distribution_lists_name_unique ON distribution_lists (lower(btrim(name)))
  WHERE archived_at IS NULL;

CREATE TABLE distribution_list_members (              -- fixed lists only (enforced in the action)
  list_id int NOT NULL REFERENCES distribution_lists ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users ON DELETE CASCADE,
  added_by_user_id int REFERENCES users ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX distribution_list_members_user_idx ON distribution_list_members (user_id);  -- for the user-delete cascade
```

- **No index on `stand_reservations (festival_id) WHERE status = 'accepted'` in 0302.** The release that carries 0302 also carries 0301 (A0). 0301 holds `notifications` exclusively, so a `CREATE INDEX` on `stand_reservations` after it takes the two tables in the reverse of a reservation change that writes the reservation and then `notify()`s in one transaction: a deadlock window during the deploy. The table is a few thousand rows, so the lists read it without one. If it is ever needed, it ships in a release of its own, or as `CREATE INDEX CONCURRENTLY` outside the migration transaction. The foreign keys to `users` take `SHARE ROW EXCLUSIVE` on `users` after 0301's locks too; that is safe only because no transaction writes `users` and then calls `notify()` (checked for this release), so none may be added before 0301 is in production.

- "Confirmados · \<festival\>" lists are **not rows**. They are computed from `festivals` every time they are used (decision 4). `festivals.name` is unique (`db/schema.ts:370`), so the label is stable.
- A saved list's name may not start with "Confirmados ·". The action checks it.
- Lists are archived, never deleted. Archiving frees the name, because of the partial unique index.

### A4. `comunicados` (0303)

```sql
CREATE TYPE comunicado_status AS ENUM ('draft', 'scheduled', 'sent');  -- 'sent' = the send has started
```

| Column                                                                   | Type                                                               | Notes                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                     | serial PK                                                          |                                                                                                                                                                                 |
| `status`                                                                 | `comunicado_status` NOT NULL DEFAULT `'draft'`                     |                                                                                                                                                                                 |
| `version`                                                                | int NOT NULL DEFAULT 1                                             | Bumped by every write: autosave, schedule, change of date, send, edit. Used for optimistic concurrency.                                                                         |
| `autosave_key`                                                           | text NULL                                                          | The last autosave's `saveKey`, written by the compare-and-set: a retry of a save that committed but lost its answer is recognised and answered with the stored version.         |
| `title`                                                                  | text NOT NULL DEFAULT `''`                                         | The working copy. After the send it is kept equal to the current revision's title, for the list pages.                                                                          |
| `doc`                                                                    | jsonb NOT NULL DEFAULT `'[]'`                                      | BlockNote blocks: the working copy.                                                                                                                                             |
| `action_label`, `action_path`                                            | text NULL                                                          | The optional button.                                                                                                                                                            |
| `send_email`                                                             | bool NOT NULL DEFAULT true                                         | Decision 1.                                                                                                                                                                     |
| `send_push`                                                              | bool NOT NULL DEFAULT false                                        | Decision 1.                                                                                                                                                                     |
| `audience`                                                               | jsonb NOT NULL DEFAULT `'{"festivals":[],"lists":[],"people":[]}'` | B1.                                                                                                                                                                             |
| `essential`                                                              | bool NOT NULL DEFAULT false                                        | Decision 5.                                                                                                                                                                     |
| `essential_reason`                                                       | text NULL                                                          | 10–300 characters, admins only.                                                                                                                                                 |
| `essential_confirmed_by_user_id`                                         | FK users **RESTRICT**                                              | Who confirmed the essential send, at "Enviar" or at "Programar".                                                                                                                |
| `essential_confirmed_at`                                                 | timestamp NULL                                                     | When.                                                                                                                                                                           |
| `scheduled_at`                                                           | timestamp NULL                                                     | The instant, picked in America/La_Paz. Naive UTC, as `posts.scheduled_at` is (`db/schema.ts:6806-6807`).                                                                        |
| `scheduled_by_user_id`                                                   | FK SET NULL                                                        |                                                                                                                                                                                 |
| `schedule_missed_at`, `schedule_missed_reason`, `schedule_missed_detail` | timestamp, text, text NULL                                         | Set when a release refused (E4). `detail` holds the refusal's own sentence.                                                                                                     |
| `campaign_id`                                                            | int NULL UNIQUE, FK `notification_campaigns` RESTRICT              | Set in the transaction that starts the send.                                                                                                                                    |
| `current_revision`                                                       | int NULL                                                           |                                                                                                                                                                                 |
| `audience_summary`                                                       | jsonb NULL                                                         | Frozen at send: per source `{kind, id, label, matched, eligible}`, totals, skips by reason, email exclusions, `essentialOverride`, `essentialNotOverridden`, `env`, `narrowed`. |
| `sent_at`, `sent_by_user_id`                                             | timestamp, FK SET NULL                                             | For a scheduled send, `sent_by` is the admin who scheduled it.                                                                                                                  |
| `retracted_at`, `retracted_by_user_id`, `retract_reason`                 |                                                                    | The reason is 1–300 characters and required.                                                                                                                                    |
| `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`   |                                                                    |                                                                                                                                                                                 |

**CHECKs.** They reference only labels of the type created in this migration, and booleans. Content CHECKs skip drafts, so an autosave halfway through a field always saves. A draft is validated in code when it is test-sent, scheduled or sent (C2).

```sql
comunicados_sent_has_campaign      CHECK ((status = 'sent') = (campaign_id IS NOT NULL))
comunicados_sent_has_revision      CHECK ((status = 'sent') = (current_revision IS NOT NULL))
comunicados_schedule_matches       CHECK ((status <> 'scheduled' OR scheduled_at IS NOT NULL)
                                          AND (status <> 'draft' OR scheduled_at IS NULL))      -- a sent row may keep it as history
comunicados_missed_only_draft      CHECK (schedule_missed_at IS NULL OR status = 'draft')
comunicados_missed_reason          CHECK ((schedule_missed_at IS NULL) = (schedule_missed_reason IS NULL)
                                          AND (schedule_missed_reason IS NULL OR schedule_missed_reason IN
                                               ('late','too_large','empty','invalid','sender_not_admin')))
comunicados_retracted_was_sent     CHECK (retracted_at IS NULL OR status = 'sent')
comunicados_retract_reason         CHECK ((retracted_at IS NULL) = (retract_reason IS NULL))
comunicados_essential              CHECK (status = 'draft' OR NOT essential OR (send_email AND essential_reason IS NOT NULL))
comunicados_essential_confirmed    CHECK ((essential_confirmed_at IS NULL) = (essential_confirmed_by_user_id IS NULL)
                                          AND (essential_confirmed_at IS NULL OR essential))
comunicados_essential_recorded     CHECK (status <> 'sent' OR NOT essential OR essential_confirmed_at IS NOT NULL)
comunicados_action_pair            CHECK (status = 'draft' OR ((action_label IS NULL) = (action_path IS NULL)))
comunicados_action_path_safe       CHECK (status = 'draft' OR action_path IS NULL OR
                                          (left(action_path,1) = '/' AND substr(action_path,2,1) NOT IN ('/', E'\\')
                                           AND action_path !~ '[[:cntrl:][:space:]]'))
```

- `comunicados_action_path_safe` is `safeActionPath` (`app/lib/notifications/definitions.ts:121-126`) plus the whitespace rule from C6.
- **The essential record is permanent.** `hasRestrictActorReferences` (`app/api/users/actions.ts:106-131`) gains `comunicados.essential_confirmed_by_user_id`. Deleting that admin's profile is then refused with "No se puede eliminar un perfil con registros administrativos vinculados." (`:96-97`), as it is for infraction authors.

**Indexes:**

- `comunicados_scheduled_idx (scheduled_at) WHERE status = 'scheduled'`, for the release and the overdue banner;
- `comunicados_status_updated_idx (status, updated_at)`, for the list tabs.

**Why a separate authoring table rather than drafts in `notification_campaigns`:**

- A gift is created and sent in one moment, so its campaign starts at `processing` (`db/schema.ts:7142-7170`). A comunicado exists long before it is sent.
- Keeping drafts out of `notification_campaigns` leaves that table's `processing → completed` meaning what it means for gifts: a send that is running, or one that has finished.
- It avoids `ADD VALUE 'draft' | 'scheduled'` on the shared status enum, whose labels A0 would bar from every CHECK.
- It avoids placeholder NOT NULL `title` and `message` values (`db/schema.ts:7150-7151`).
- "Enviando…" is `notification_campaigns.status = 'processing'`.

### A5. `comunicado_revisions` (0303)

| Column                             | Notes                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `comunicado_id`                    | FK `comunicados` **RESTRICT**, so a sent comunicado cannot be deleted.                                       |
| `revision`                         | int; PK `(comunicado_id, revision)`; CHECK `revision >= 1`.                                                  |
| `title`                            | text NOT NULL; CHECK `char_length(title) BETWEEN 1 AND 80`.                                                  |
| `doc`                              | jsonb NOT NULL: the normalized document (C2).                                                                |
| `html`                             | text NOT NULL: `blocksToSanitizedHtml(doc, "announcement")`, rendered on the server only.                    |
| `text`                             | text NOT NULL: plain text without URLs (C3).                                                                 |
| `action_label`, `action_path`      | The pair and path CHECKs from A4, without the draft exemption.                                               |
| `edit_note`                        | text NULL, ≤ 300, internal. Null on revision 1. **Required when the comunicado is essential** (F1, in code). |
| `created_by_user_id`, `created_at` | FK SET NULL. `created_at` comes from `clock_timestamp()`, because an edit waits for a lock first (F1).       |

- Rows are never updated. The code and the tests both hold to this.
- Revision 1 is written in the transaction that starts the send.
- `notification_campaigns.title` and `message` (both NOT NULL) receive the current revision's title and `text` at send and on each edit. That keeps their comment, "what participants see" (`db/schema.ts:7134-7141`), true.

### A6. Reused: `notification_campaigns` and `notification_campaign_recipients` (0303)

```sql
ALTER TYPE notification_campaign_type ADD VALUE 'comunicado';
ALTER TYPE notification_campaign_recipient_status ADD VALUE 'notified';   -- "its inbox item was written"
CREATE TYPE campaign_recipient_source AS ENUM ('list', 'person', 'staging_admin');
ALTER TABLE notification_campaign_recipients ADD COLUMN source campaign_recipient_source;   -- NULL for gifts
```

**`notification_campaigns`: one row per sent comunicado.**

- `type = 'comunicado'`, with status `processing → completed`.
- `title` and `message` come from the current revision.
- `created_by_user_id` is the sender.
- `idempotency_key = 'comunicado:{id}'`. The key is unique across types (`db/schema.ts:7162-7164`), so a second campaign for the same comunicado is impossible. Gift keys are UUIDs (`app/lib/credit_gifts/definitions.ts:174`).
- `completed_at`.

**Gift code never sees these rows.**

- Every gift query and the gift resume filter `type = 'credit_gift'` (`credit_gifts/service.ts:336,691`; `credit_gifts/queries.ts:145,271`).
- Literal status unions such as `CreditGiftRecipientRow.status` (`credit_gifts/queries.ts:192`) do not narrow today: `credit_gifts/queries.ts:377` assigns `status: row.status` directly. Once 0303 adds `notified`, that line no longer typechecks, so PR 4 narrows it. The value never occurs there, since the gift is first read with `type = 'credit_gift'` (`:271`).

**Recipients: one row per person.**

- They reuse `unique(campaign_id, user_id)`, the pending partial index, `attempts`, `last_error`, `processed_at` and `notification_id` (`db/schema.ts:7370-7426`).
- They reuse the CHECK `(status='skipped') = (skipped_reason IS NOT NULL)`. Skip reasons are stored as labels, as gifts store them (`credit_gifts/service.ts:249`).
- Gift-only columns stay NULL: `ledger_entry_id`, `reversal_entry_id`, `revoked_at`, `revoked_by_user_id`.
- `revoked_was_granted` can never fire, because retraction is per comunicado, never per recipient.
- `source` is how the person entered the audience. Every send-time check is an allowlist on it: a row without a source, or with an unknown one, is never sent (D3).

### A7. Registry kinds (code: `app/lib/notifications/kinds/comunicado.ts`)

```ts
comunicado: {
  category: "announcements",
  schema: z.object({
    comunicadoId: serialId, revision: z.number().int().min(1),
    title: z.string().min(1).max(80), excerpt: z.string().max(281),
    actionPath: z.string().nullable(), actionLabel: z.string().nullable(),
  }),
  inApp: (d) => ({ title: d.title, body: d.excerpt, actionPath: d.actionPath, actionLabel: d.actionLabel }),
  opensDetail: () => true,          // text someone wrote (PRD §7, §10 P2b)
  push: "per_send",                 // D6
},                                   // no `email`: its email is the bulk lane's (D3)
comunicado_not_sent: {              // Administración, in-app only, no push
  category: "admin",
  schema: z.object({ comunicadoId: serialId, title: z.string(),
                     reason: z.enum(["late","too_large","empty","invalid","sender_not_admin"]),
                     detail: z.string().max(300).nullable(),
                     scheduledAt: z.string(), audienceCount: z.number().int().nullable() }),
  inApp: …, // copy in G9; actionPath `/dashboard/communications/{id}`, actionLabel "Ver comunicado"
},
```

- `hasEmail("comunicado")` is false.
  - `notify()` never writes a transactional email row for it.
  - `buildEmailCopy` returns null, so a bulk row that somehow reached the transactional worker would fail `render_unavailable` without sending (`deliveries.ts:189-197`).
  - Separately, `claimDelivery` refuses bulk email (D4).
- "Sends no email for the phase 2 copies" (`app/lib/notifications/registry.test.ts:258-261`, exactly two email kinds) does not change.

### A8. What links to what

```
comunicados ─┬─* comunicado_revisions
             └─1 notification_campaigns (type 'comunicado', created at send)
                   ├─* notification_campaign_recipients (source, status, notification_id)
                   └─* notifications (kind 'comunicado', dedupe 'comunicado:{id}', edited_at, retracted_at)
                         └─* notification_deliveries (lane 'bulk': email {comunicadoId}, push {})
comunicados.audience (jsonb) ──> festivals ("Confirmados") | distribution_lists | users
distribution_lists 1─* distribution_list_members (fixed lists only)
```

### A9. Constants (`app/lib/comunicados/definitions.ts` unless noted)

| Constant                                                                                 | Value                                                                                                                                   | Why                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `COMUNICADO_TITLE_MAX`                                                                   | 80                                                                                                                                      | It is the email subject and the push title. Push caps at 120 (`push/payload.ts:41-42`).                                                 |
| `COMUNICADO_TEXT_MAX`                                                                    | 5,000 characters of plain text                                                                                                          | About a screen of reading.                                                                                                              |
| `COMUNICADO_DOC_MAX_BYTES` / `COMUNICADO_MAX_BLOCKS`                                     | 64 KB of JSON / 200 blocks, children counted                                                                                            |                                                                                                                                         |
| `COMUNICADO_MAX_IMAGES`                                                                  | 6                                                                                                                                       | PR 8 only.                                                                                                                              |
| `COMUNICADO_EMAIL_HTML_MAX_BYTES`                                                        | 90 KB                                                                                                                                   | Gmail clips at 102 KB.                                                                                                                  |
| `COMUNICADO_EXCERPT_MAX`                                                                 | 280                                                                                                                                     | The list clamps the body to 2 lines (`notification-item.tsx:57-58`).                                                                    |
| `COMUNICADO_ACTION_LABEL_MAX`                                                            | 30                                                                                                                                      |                                                                                                                                         |
| `COMUNICADO_MAX_SOURCES` / `COMUNICADO_MAX_PEOPLE`                                       | 10 (festivals + lists) / 100                                                                                                            |                                                                                                                                         |
| `COMUNICADO_MAX_RECIPIENTS`                                                              | 3,000 eligible, counted before narrowing                                                                                                | K6                                                                                                                                      |
| `COMUNICADO_TYPE_TO_CONFIRM_RECIPIENTS`                                                  | 300, and always when essential                                                                                                          | K6                                                                                                                                      |
| `COMUNICADO_SCHEDULE_MIN_LEAD_MS` / `…_MAX_AHEAD_DAYS`                                   | 5 min / 60 days                                                                                                                         |                                                                                                                                         |
| `COMUNICADO_SCHEDULE_LATE_LIMIT_MS`                                                      | 60 min                                                                                                                                  | K5                                                                                                                                      |
| `COMUNICADO_SCHEDULE_OVERDUE_BANNER_MS`                                                  | 3 min                                                                                                                                   | G3, G6                                                                                                                                  |
| `ESSENTIAL_FESTIVAL_GRACE_DAYS`                                                          | 7                                                                                                                                       | B7, K8                                                                                                                                  |
| `FANOUT_CHUNK` / `FANOUT_MAX_ATTEMPTS`                                                   | 250 / 3                                                                                                                                 | The chunk is new: gifts process one recipient per transaction. The 3 is gifts' `MAX_RECIPIENT_ATTEMPTS` (`credit_gifts/service.ts:51`). |
| `BULK_BATCH_SIZE`                                                                        | 100                                                                                                                                     | `RESEND_BATCH_MAX_EMAILS` (`app/vendors/resend.ts:19`).                                                                                 |
| `BULK_BATCH_SPACING_MS`                                                                  | 1,500, slept **under** the lane lock                                                                                                    | D4                                                                                                                                      |
| `BULK_BATCH_RESERVE_MS`                                                                  | 25,000: no batch starts with less time left                                                                                             | render, one Resend call with its one throttle retry, spacing, margin                                                                    |
| `BULK_LANE_LOCK_POLL_MS`                                                                 | 500                                                                                                                                     | D3                                                                                                                                      |
| `BULK_EMAIL_TTL_MS`                                                                      | 20 h from the row's `created_at`                                                                                                        | Resend keeps keys for 24 h (`resend.ts:32-33`).                                                                                         |
| `BULK_PUSH_CONCURRENCY`                                                                  | 8                                                                                                                                       | D5                                                                                                                                      |
| `COMUNICADOS_CRON_DEADLINE_MS` / `SEND_AFTER_DEADLINE_MS` / `PROCESS_BUTTON_DEADLINE_MS` | 75,000 / 85,000 / 80,000                                                                                                                | All under `maxDuration: 100` (`vercel.json`).                                                                                           |
| `RESEND_THROTTLE_RETRY_MAX_MS` (`app/vendors/resend.ts`)                                 | 2,000                                                                                                                                   | D4                                                                                                                                      |
| `LIST_MAX_FIXED_MEMBERS`                                                                 | 3,000                                                                                                                                   |                                                                                                                                         |
| Rate limits (`consumeActionRateLimit`, `app/lib/rate-limit.ts:50`)                       | Test send: 5 per 10 min per admin. "Reintentar fallidos": 1 per 5 min per comunicado. "Procesar envíos pendientes": 1 per 30 s overall. |                                                                                                                                         |

---

## B. Audience resolution

### B1. The spec a draft stores

```ts
export const ComunicadoAudienceSchema = z
  .object({
    festivals: z.array(serialId).max(10), // "Confirmados · <festival>", any festival status, past ones included
    lists: z.array(serialId).max(10), // saved lists, filter or fixed
    people: z.array(serialId).max(COMUNICADO_MAX_PEOPLE),
  })
  .strict()
  .refine((a) => a.festivals.length + a.lists.length <= COMUNICADO_MAX_SOURCES)
  .refine(
    (a) => a.festivals.length + a.lists.length + a.people.length > 0,
    "Elegí al menos una lista o una persona.",
  );
```

A send to people alone is allowed, so a comunicado can go to exactly one person (decision 8).

### B2. Sources

One resolver, `resolveComunicadoAudience(executor, audience, { narrow })` in `app/lib/comunicados/audience.ts`. It is a single SQL statement whose `sources` CTE returns `(user_id, via)`.

| Source                                                                                | SQL inside `sources`                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmados · F (decision 4)                                                          | `SELECT p.user_id, 'list' FROM participations p JOIN stand_reservations sr ON sr.id = p.reservation_id WHERE sr.festival_id = ANY($festivals) AND sr.status = 'accepted'` `UNION ALL SELECT sr.owner_user_id, 'list' FROM stand_reservations sr WHERE sr.festival_id = ANY($festivals) AND sr.status = 'accepted' AND sr.owner_user_id IS NOT NULL` |
| Saved filter list                                                                     | the v1 predicate (B3), per list                                                                                                                                                                                                                                                                                                                     |
| Saved fixed list                                                                      | `SELECT m.user_id, 'list' FROM distribution_list_members m WHERE m.list_id = ANY($fixedIds)`                                                                                                                                                                                                                                                        |
| People picked by name                                                                 | `SELECT unnest($people::int[]), 'person'`                                                                                                                                                                                                                                                                                                           |
| Staging admins (only when `narrow`, and only when there is a festival or list source) | `SELECT id, 'staging_admin' FROM users WHERE role = 'admin'`                                                                                                                                                                                                                                                                                        |

**About Confirmados:**

- The owner arm only guards legacy reservations whose owner has no `participations` row. `owner_user_id` was backfilled by a script. Otherwise the owner is always a participations row.
- It never reads `stand_reservation_stands.reservation_status` (`db/schema.ts:1311-1317`).
- Pre-reveal reservations (`reveal_at`) are included. The list is admin-only, and each recipient sees only their own copy.
- Members with another role (admin owners, `artist` partners) stay in the list and are skipped as "No es participante".

**Archived lists and broken filters:**

- An archived list still resolves when a draft or a schedule names it. Archiving only hides a list from the pickers.
- A stored filter that no longer parses refuses the send: "La lista «…» tiene un filtro que ya no se puede leer; editala." It never evaluates to everyone.

### B3. Saved filter lists: the v1 attributes (`app/lib/distribution_lists/definitions.ts`)

```ts
export const DistributionListFilterV1 = z
  .object({
    v: z.literal(1),
    areas: z
      .array(z.enum(["illustration", "gastronomy", "entrepreneurship"]))
      .max(3)
      .default([]),
    subcategoryIds: z.array(serialId).max(30).default([]),
    states: z.array(z.enum(STATE_VALUES)).max(9).default([]), // departamento, from stateOptions (app/lib/utils.ts:210-220)
    confirmedAtFestivalIds: z.array(serialId).max(20).default([]), // confirmed at ANY of these
    notConfirmedAtFestivalIds: z.array(serialId).max(20).default([]), // and at NONE of these
    includePaused: z.boolean().default(true),
  })
  .strict();
```

```sql
SELECT u.id, 'list' FROM users u
WHERE u.role = 'user'                                                   -- lists only ever hold participants
  AND u.status = ANY($statuses)                                         -- {verified,paused} or {verified}
  AND (cardinality($areas) = 0 OR u.category = ANY($areasExpanded))    -- illustration also matches new_artist (policy.ts:75-80)
  AND (cardinality($subs) = 0 OR EXISTS (SELECT 1 FROM profile_subcategories ps
         WHERE ps.profile_id = u.id AND ps.subcategory_id = ANY($subs)))
  AND (cardinality($states) = 0 OR u.state = ANY($states))
  AND (cardinality($fin) = 0 OR u.id IN (<Confirmados · F for F in $fin>))       -- the B2 SQL, owner arm included
  AND (cardinality($fout) = 0 OR u.id NOT IN (<Confirmados · F for F in $fout>))
```

- The two festival fields use the Confirmados SQL itself, so a legacy owner without a `participations` row counts as confirmed there exactly as on "Confirmados · F". Neither arm yields NULL, so `NOT IN` is safe.

- Attributes are ANDed; the values within one attribute are ORed.
- An empty filter means every participant ("Sin filtros: son todos los participantes habilitados").
- The filter is evaluated whenever it is used: in the counts, in the gift picker, and at send or release. It is never cached.
- **Not in v1:** tags, gender, participation type, profile completeness and sanctions. Each would be one zod field and one predicate later (K10).

### B4. Union, dedupe and snapshot (one statement, inside the send transaction)

```sql
WITH sources AS (…B2…),
dedup AS (
  SELECT user_id,
         CASE WHEN bool_or(via = 'person') THEN 'person'
              WHEN bool_or(via = 'staging_admin') THEN 'staging_admin'
              ELSE 'list' END AS source
  FROM sources GROUP BY user_id
)
INSERT INTO notification_campaign_recipients (campaign_id, user_id, status, skipped_reason, source, processed_at)
SELECT $c, d.user_id,
       CASE WHEN r.reason IS NULL THEN 'pending' ELSE 'skipped' END::notification_campaign_recipient_status,
       r.reason, d.source::campaign_recipient_source,
       CASE WHEN r.reason IS NULL THEN NULL ELSE now() END
FROM dedup d
JOIN users u ON u.id = d.user_id                -- a deleted user drops out here
CROSS JOIN LATERAL (SELECT <comunicadoSkipReasonSql(u, d.source, $narrow)> AS reason) r
ORDER BY d.user_id                              -- foreign-key locks taken in ascending id order
ON CONFLICT (campaign_id, user_id) DO NOTHING
RETURNING status, skipped_reason;
```

- **People picked by name win over list membership.**
- **Lock order.** The foreign-key `FOR KEY SHARE` locks on `users` are taken at the end of the statement, in insertion order. `ORDER BY d.user_id` makes that ascending, the same order reservations use for their `FOR UPDATE` (`app/lib/reservations/locks.ts:145-158`), so the two cannot deadlock.
- **Retried once.** A deletion that commits mid-statement (23503) or a deadlock (40P01) retries the whole send transaction once (D1). A scheduled release never records either one as a refusal.
- **Counts.** The confirm dialog's counts (B8) come from the same SQL with `SELECT` in place of `INSERT`.
- **Size.** 3,000 rows is one statement, far under the 65,535-parameter limit, because the ids travel as arrays.

**One number on every screen.** The composer chips, the lists pages, the gift picker and the confirm dialog all show "pueden recibirlo hoy": the eligible count from this SQL, before narrowing, with "· N no lo reciben" under it. The gift picker shows the same count, because a list's members are judged by the same participant rule (B5).

### B5. Eligibility and skip reasons

One shared module, `app/lib/participants/recipient-eligibility.ts`, which gifts switch to with identical behaviour:

- `participantSkipReason({ role, status })` is today's `creditGiftSkipReason` (`app/lib/credit_gifts/definitions.ts:192-202`). It imports `PARTICIPANT_READ_ONLY_ROUTE_STATUSES` (`app/lib/participants/definitions.ts:21-24`) instead of re-typing it.
- `pendingDeletionUserIds` is now exported (`credit_gifts/service.ts:81-98`).
- `classifyParticipantRecipients(ids)` is today's `classifyCreditGiftRecipients` (`credit_gifts/service.ts:105-125`).
- `comunicadoSkipReasonSql(u, source, narrow)` is the comunicado rule as a SQL `CASE`. The first match wins:

| #   | Condition                                                                                 | Label stored in `skipped_reason`        |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | a `pending_user_deletions` row with `local_deleted_at IS NULL`                            | Cuenta en eliminación                   |
| 2   | `source ∈ (person, staging_admin)` and `role = 'admin'` and `status <> 'banned'`          | _(eligible)_                            |
| 3   | `source = 'staging_admin'` and no longer an admin                                         | No es participante                      |
| 4   | `role <> 'user'`                                                                          | No es participante                      |
| 5   | `status = 'banned'`                                                                       | Cuenta suspendida                       |
| 6   | `status NOT IN ('verified','paused')`                                                     | Perfil no verificado                    |
| 7   | `narrow AND source IS DISTINCT FROM 'person' AND source IS DISTINCT FROM 'staging_admin'` | Entorno de prueba: no se envía a listas |
| 8   | _(added by a retraction to rows still pending)_                                           | Retirado antes de enviarse              |

Real ineligibility (rows 4–6) is checked before row 7, so a preview's counts still exercise the rules.

**Proposed (K13): people picked by name may include global admins; lists only ever hold participants.**

- An admin can then run a real comunicado through the whole production pipeline to themselves, or to "Ana y yo", before a large send.
- It matches the preview rule, where admins are the substitutes anyway.
- Lists stay participant-only, so they mean the same thing in the gift picker, which takes participants only.
- The name search offers neither festival admins nor `artist` accounts. If such an id arrives anyway, it is skipped by row 4.

**Checked four times:**

1. in the composer and dialog counts (B8);
2. in the snapshot at send;
3. under the user lock in each fan-out chunk, which decides whether an inbox row is written (D2);
4. right before each email (D3, the same rule in SQL, as an allowlist on `source`) and each push (the existing `deleting` and flag checks, `push/send.ts:194-202`).

A ban or a deletion request in between leaves the person skipped, not notified.

### B6. The preview narrowing (decision 8), enforced on the server

- **Where.** `const narrow = serverEnv.VERCEL_ENV !== "production"`, read inside `startComunicadoSend` and never taken from the client.
- **Development is included.**
  - An unset `VERCEL_ENV` counts as development (`env.ts:71-73`).
  - A local server may point at a shared or production database (AGENTS.md).
  - Push is not a no-op in development when VAPID keys are set (AGENTS.md).
  - This extends the decision's wording, so it is asked as K9.
- **When `narrow` is set and the audience has a festival or list source:**
  - list members who would be eligible are written `skipped` with "Entorno de prueba: no se envía a listas";
  - every global admin without a pending deletion is added with `source = 'staging_admin'`, unless they were picked by name.
- **People picked by name** are processed normally.
  - On previews they receive real email (decision 8), marked as staging mail (D7).
  - Development is a Resend no-op (`app/vendors/resend.ts:52,127`), and the copy there says so (G3, G5).
- **Defence in depth.**
  - The email pre-check (D3) re-applies row 7 using the **sending** process's own `VERCEL_ENV`. It is an allowlist: only `person` and `staging_admin` rows pass outside production, and a row with a missing or null `source` never passes. Two cases it covers:
    - a snapshot bug;
    - a comunicado written on one preview and drained by another, since all previews share one database.
  - The fan-out chunk re-applies row 7 too, by its own `VERCEL_ENV` and the `source` it reads (D2 step 6), so the inbox and push are covered, not only email.
  - Lane-wide drains (fan-out, bulk email claims, bulk push selection) take only campaigns whose `audience_summary.env` equals the draining process's `VERCEL_ENV` (D9). Rows a dev server leaves in a shared or production database are never sent by a preview or by the production cron.
- **The cap** (3,000) and the "nobody eligible" refusal are computed **before** narrowing, so a preview refuses exactly what production would.

### B7. Email rules: opt-out, suppression, essential

The Anuncios opt-out is **email only**. The inbox copy always lands (decision 1), and push depends only on the admin's tick and the device.

| Address state                                                                           | Normal send                    | Essential send                                      |
| --------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| Active suppression, bounce **or complaint** (`email_suppressions`, `lifted_at IS NULL`) | not emailed: `suppressed`      | **not emailed** (Resend refuses them anyway)        |
| Unsubscribed from `announcements`                                                       | not emailed: `unsubscribed`    | **emailed**, with no `List-Unsubscribe` header (D7) |
| Unsubscribed from `all`                                                                 | not emailed: `unsubscribed`    | **not emailed**: `unsubscribed` (proposed; K2)      |
| Fails `isDeliverableEmail` (`app/lib/festivals/invitation-helpers.ts:23`)               | not emailed: `invalid_address` | not emailed                                         |

**Why essential honours `all`:**

- `all` is the opt-out an admin records when someone asks support to stop all bulk mail (`app/components/emails/unsubscribe-card.tsx:31-35`).
- The page has told those people "Ya no enviaremos todos nuestros correos masivos" (`app/lib/emails/topics.ts:24`; `unsubscribe-card.tsx:80-82`), with no exception.
- Any new copy we write cannot reach people who already opted out.
- They still get the inbox copy, and push if it is ticked.

**Helpers** (`app/lib/emails/suppressions.ts`). One helper serves both the counts and the send.

- `comunicadoEmailExclusion(address: SQL, { essential })` returns `'suppressed' | 'unsubscribed' | null`. It is correlated on `lower(trim(address))`.
- `announcementOptOutOverridden(address: SQL, essential)` is true when only the Anuncios opt-out stood in the way and essential lifted it.
- Both are needed because `bulkMailExclusion` folds complaints into `opted_out` (`suppressions.ts:308-330`), and an essential send must still respect a complaint.

**Essential (decision 5):**

- **Allowed only when all of these hold.** They are checked on save, on schedule, and inside the send transaction (`ESSENTIAL_NOT_ALLOWED`); the CHECK `comunicados_essential` backs the email rule.
  - The audience is exactly one festival source: no lists, nobody picked by name.
  - Email is ticked.
  - The festival is **current or upcoming**: `status <> 'archived'`, and its last `festival_dates.end_date` (`db/schema.ts:598-615`) is no more than 7 days ago. A festival without dates is judged by its status alone. This narrows decision 5 to its own example, a setup-time change, so it is asked as K8.
  - "Programar" and "Cambiar fecha" judge this window at the time chosen, since the release judges it then: a festival that will have ended more than 7 days before that time is refused with "Para esa fecha el festival habrá terminado hace más de 7 días: un comunicado esencial tiene que salir antes. Elegí una fecha anterior." (`INVALID_DATE`, shown under the picker).
- **What it overrides.** Only the `announcements` unsubscribe; never `all`, never a suppression.
- **What is recorded:**
  - `essential_reason`, `essential_confirmed_by_user_id` (RESTRICT, A4) and `essential_confirmed_at`, from the "Enviar" or "Programar" confirmation;
  - the festival, as the single source in `audience`;
  - `sent_at` and `sent_by_user_id`;
  - in `audience_summary`: `essentialOverride` (how many Anuncios opt-outs it reached) and `essentialNotOverridden` (`all` opt-outs and suppressed addresses it did not), both counted at send;
  - each later edit, as a revision with a required `edit_note` (F1).
- **The record is permanent.** The revision foreign key is RESTRICT, so a sent comunicado cannot be deleted, and the confirmer's profile cannot be deleted either (A4). Query I4 #6 lists every essential send.

### B8. When the audience is frozen

- **At send start, never at schedule time.**
  - For "Enviar ahora", that is the confirm transaction.
  - For a scheduled send, it is the release transaction (E3).
  - Lists are "computed when used" and filters "re-evaluated at send time" (PRD §12, Audiences).
- **The schedule dialog says so:** "La audiencia se calcula al momento del envío: hoy serían 1.240 personas."
- **Drift guard:**
  - When typed confirmation applies (≥ 300 eligible, or essential), the server compares the typed number with its own count inside the send transaction. This is for "Enviar ahora" only: a release has no typed count (E3, K14).
  - On a mismatch it rolls back with `AUDIENCE_CHANGED`: "La audiencia cambió: ahora son 1.251 personas. Revisá y confirmá de nuevo."
  - This is the gifts' `CONFIRMATION_MISMATCH` pattern (`credit_gifts/service.ts:210-217`).
  - Below the threshold, a small drift is accepted.
- **The snapshot is the recipient rows plus `audience_summary`.** So the report can still say "Lista «Ilustración La Paz» (filtro al 24/10, 312 personas)" after the list itself changes.

### B9. Lists in the credit-gift picker (100-recipient cap)

- **Client.** An "Agregar una lista" button sits next to the search in `CreditGiftRecipientPicker` (`app/components/credit_gifts/admin/credit-gift-recipient-picker.tsx:62-78`).
  - It opens a combobox with two groups, "Confirmados por festival" and "Listas guardadas", each with its "pueden recibirlo hoy" count (B4).
  - The composer gains `onAddMany` next to `onAdd` (`credit-gift-composer.tsx:130-136`).
- **Server.** `expandListForCreditGiftAction({ kind: "festival", festivalId } | { kind: "list", listId })` in `app/lib/credit_gifts/actions.ts`:
  - checks `creditGiftBlocker` (`app/lib/credit_gifts/access.ts:17-25`), `featureFlagGuard("comunicados")` and `serverEnv.VERCEL_ENV === "production"`;
  - resolves the list (B2, B3);
  - classifies the members with `classifyParticipantRecipients`;
  - returns `CreditGiftRecipientOption[]` through `toOption` (`credit_gifts/queries.ts:33-54`), plus a count of those skipped.
- **The cap is not raised and nothing is truncated (K16).** If the people already chosen plus the list's new eligible members would pass 100, nothing is added:
  - "Con «Confirmados · Glitter Navidad 2026» serían 340 personas y un regalo llega a 100 como máximo. Elegí una lista más chica o agregá personas una por una."
  - On success: "Agregamos 42 personas de «Ilustración Cochabamba» (8 ya estaban). 3 no pueden recibir regalos."
- **The gift server code does not change.** The list expands into explicit ids on the client. `createCreditGift` (`credit_gifts/service.ts:194`), `replayCreditGift` (`:131-184`), the typed total and `CreateCreditGiftSchema` all see a plain list of ids.
- **Outside production the button is disabled (K16):** "En el entorno de prueba no se pueden agregar listas a un regalo: agregá a las personas por nombre."
  - Gifts accept participants only, so they cannot be narrowed to admins.
  - Gift email is real on previews.
  - The first real use is therefore checked by hand in production (I2).

---

## C. Content

### C1. The BlockNote variant `announcement` (`app/lib/rich-text/schemas.ts`, `sanitize.ts`)

```ts
export const ANNOUNCEMENT_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "quote",
  "divider",
] as const; // + "image" in PR 8
export const announcementEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph,
    heading: createHeadingBlockSpec({ levels: [2, 3] }),
    bulletListItem,
    numberedListItem,
    quote,
    divider,
  },
});
```

- `EditorVariant` (`schemas.ts:48`) gains `"announcement"`.
- **Inline content:** text and links. **Styles:** bold and italic only. Lists nest at most 2 levels: Tab stops there in the editor, and a deeper level that arrives another way (a paste) is lifted on save (C2).
- **Not offered:** underline, strike, code, colours, alignment, tables, toggles, checklists.
  - The sanitizer already drops colours, underline, strike and alignment.
  - The rest break in email clients.
- **Editor:**
  - `RichTextEditor` with `variant="announcement"`, with BlockNote's default formatting toolbar off;
  - a small toolbar built from `EditorTopToolbar`'s pieces, without strike: Negrita · Cursiva · Enlace · Título · Subtítulo · Lista · Lista numerada · Cita · Separador (· Imagen in PR 8);
  - the filtered slash menu on desktop (`app/components/organisms/rich-text-editor-inner.tsx:33-61,106-116`).
- **Sanitizer:** `ANNOUNCEMENT_TAGS` = the compact tags (`p, h2, h3, ul, ol, li, strong, em, a, blockquote, br`, `sanitize.ts:5-17`) plus `hr` (and `img, figure, figcaption` in PR 8).

### C2. Server-side validation: `normalizeAnnouncementDoc(blocks, { stage })` in `app/lib/comunicados/content.ts`

`stage` is `"draft"` for autosave, and `"send"` for test send, schedule, send and edit. HTML from the client is never used (`app/lib/posts/render.ts:5-15`).

1. **Shape** (both stages): an array, ≤ 64 KB as JSON, ≤ 200 blocks counting children. The 64 KB holds for the normalized document too: normalizing can grow it (spaces in an address become `%20`, a caption is copied into `name`), and each batch of a send normalizes its revision again.
2. **Refused, with a message** (both stages):
   - a block type outside the list, through `disallowedBlockTypes(blocks, "announcement")` (`schemas.ts:132-140`). An unknown type makes the renderer throw. Message: "Este bloque no se puede usar en un comunicado: tabla."
   - a link that fails step 4;
   - a shape it cannot read (a heading level that is not a number, for example).
3. **Normalized silently** (both stages), so a paste from Word, Google Docs or Markdown never fails a save:
   - styles other than bold and italic are dropped;
   - `textColor`, `backgroundColor` and `textAlignment` are reset;
   - heading levels are clamped to the nearer of Título and Subtítulo (1 → 2, 4–6 → 3); BlockNote's paste rules ignore the editor's levels, and the editor also clamps whatever a paste or a drop brings, outside the undo history, so one undo takes back the paste or the drop;
   - nesting deeper than 2 is lifted: the children of a depth-2 block follow it as siblings, in order;
   - empty trailing paragraphs are trimmed.
4. **Links** must pass `isAllowedRichTextUri` (`sanitize.ts:60`): `https:`, `http:`, `mailto:` or a root-relative `/path`, with no control characters. Anything else is refused: "Revisá el enlace «…»". Whitespace inside an address is percent-encoded on save, so the inbox, the email and the text part carry the same address.
5. **Images (PR 8)** must pass `isUploadThingFileUrl` (`app/lib/uploadthing/file-key.ts`, pure, so the client and the sanitizer use it too): `https:`, a `utfs.io`, `ufs.sh` or `*.ufs.sh` host with no port or credentials, a bare `/f/<key>` path, no query or fragment, and written exactly as a URL parser writes it back (nothing it would trim, lower-case, encode or resolve). `getUploadThingFileKey` moved to the same file; `storage.ts` re-exports it.
   - At most 6, at both stages: "Un comunicado puede tener hasta 6 imágenes."
   - An image with no address (an upload that never finished) is dropped at both stages, and what was nested under it takes its place.
   - On autosave a foreign image is kept; the composer flags it (`foreignComunicadoImageUrls`, `app/lib/comunicados/images.ts`).
   - At `send` stage it is refused: "Esta imagen no está subida a Glitter: subila de nuevo."
6. **Text** (send stage only): plain text ≤ 5,000 characters, and visible content (`richTextBodyHasVisibleContent`, `app/lib/festival-terms/html.ts:144-161`). Drafts may be incomplete.
7. **Rendered email** (send stage only): ≤ 90 KB. Message: "El correo quedaría demasiado largo y Gmail lo cortaría. Acortá el texto o sacá alguna imagen."
8. **The rest** (send stage only):
   - the title is trimmed, 1–80 characters, with no line breaks;
   - the button label is 1–30 characters;
   - the button path passes C6's rule.

### C3. The three renderings, all on the server from the normalized blocks

| Rendering         | Function                                                                                                                                                                                                                                                      | Stored                                                                | Used by                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbox detail HTML | `blocksToSanitizedHtml(doc, "announcement")` (`app/lib/rich-text/render.ts:10-31`)                                                                                                                                                                            | `comunicado_revisions.html` (for the draft preview, rendered on save) | the detail page, through `RichTextHtml` (`app/components/molecules/rich-text-html.tsx`, with `hr` (and `img`) styles added); the report's "Mensaje" card |
| Email             | `announcementBlocksToEmail(blocks, { baseUrl })` in `app/emails/comunicado-blocks.tsx`: a **synchronous** walker modelled on `blocksToSeedHtml` (`festival-terms/html.ts:23-122`), returning React Email nodes with inline styles from `app/emails/styles.ts` | not stored; rendered per recipient by the bulk lane (D3)              | `app/emails/comunicado.tsx`                                                                                                                              |
| Plain text        | `announcementBlocksToText(blocks, { withUrls })` in `app/lib/comunicados/text.ts`                                                                                                                                                                             | `comunicado_revisions.text` (without URLs)                            | the excerpt; `notification_campaigns.message`; the email's `text` part (with URLs, rendered at send)                                                     |

**Inbox HTML rule:** BlockNote fills an empty paragraph, heading or list item with U+FFFC when it exports HTML, which a browser draws as an "OBJ" box; `blocksToSanitizedHtml` strips it, for every variant, as BlockNote's own Markdown export does.

**Plain-text rules:** a blank line between blocks; headings on their own line; "• " and "1. " for list items; links as "texto", or with `withUrls` as "texto (https://…)", printing exactly the address the email links to (`comunicadoEmailHref`), or none when the email leaves the link as words; dividers as "—"; images as their caption, or nothing.

**Email walker rules:**

- headings become `Heading as="h2|h3"`, paragraphs `Text`, quotes a `Section` with a left border, dividers `Hr` followed by any blocks nested under them;
- lists become `ul`/`ol` with inline padding;
- images (PR 8) become `Img` with a `width="430"` attribute (Outlook ignores CSS widths) and width 100%, `max-width: 430px`, `height: auto`, with the caption or "" as alt: the body is 430 px wide, a 480 px container less its padding and border (`app/emails/styles.ts`). An image that fails C2 step 5's host rule renders nothing, though the send stage has already refused it;
- it never emits `details`, `input`, `figure` or `pre`;
- **root-relative links are made absolute by plain concatenation** with `publicBaseUrl()`, after C6's checks, never with `new URL(href, base)`.

**`publicBaseUrl()`** in `app/lib/urls.ts` is extracted from `app/lib/programs/notifications.ts:37-60`:

- it takes `NEXT_PUBLIC_BASE_URL`, then `https://${VERCEL_URL}`, then localhost;
- `unsubscribeLinks` (`app/lib/emails/unsubscribe-links.ts:14-19`, which today falls back to localhost) and the comunicado renderer both use it;
- outside development the bulk lane refuses a base that is not `https:` or is localhost (D3, D9), and so does the send action: "Falta configurar la dirección pública del sitio: los enlaces del correo no funcionarían."

**Not used:** `@blocknote/xl-email-exporter` is `GPL-3.0 OR PROPRIETARY`.

**Excerpt:** `excerptOf(text)` collapses whitespace and cuts at 280 characters on a word boundary, adding "…" when it cuts. It becomes `notifications.body`.

**Push:** the title, then "Tocá para ver el detalle.". The kind `opensDetail`, so `buildPushPayload` already does this (`push/payload.ts:89-97`). The text itself never sits on a lock screen.

### C4. Images (PR 8, separable; K11)

- **Route:** a new UploadThing route `comunicadoImage` in `app/api/uploadthing/core.ts`, modelled on `festivalArtwork` (`core.ts:36-56`):
  - `image/jpeg` and `image/png` only ("WebP or SVG break in Outlook and Gmail", `core.ts:36-37`), 4 MB, one file;
  - middleware: `requireAdmin()` and `isFeatureEnabled("comunicados", profile)`;
  - returns `{ imageUrl: file.ufsUrl }`.
- **Not `blogImage`:** it admits contributors and any format (`core.ts:632-650`).
- **Upload tab only.** The announcement editor renders BlockNote's `FilePanel` with the Upload tab alone. By default the panel always adds an "Embed" URL tab (`node_modules/@blocknote/react/src/components/FilePanel/FilePanel.tsx:43-57`). Pasted images are handled by C2.5.
- **Help text:** "JPG o PNG, hasta 4 MB. Se ve mejor a 1200 px de ancho."
- **In the editor:**
  - a pasted or dropped file that is not an image (a PDF, a .docx) is refused before BlockNote sees it, with the toast "Subí una imagen JPG o PNG.": BlockNote would make a "file" block, which a comunicado does not have, and fail. A copy that also carries text, as Word's does, is pasted as text;
  - while an image uploads, the text holds it with no address, and a save drops it (C2.5): "Enviarme una prueba", "Programar…", "Enviar…" and "Guardar cambios…" stay off, with "Esperá a que termine de subir la imagen.", and closing the tab asks first;
  - images show no resize handle: their size is not kept.
- **Pasted tables:** a comunicado has none, and BlockNote runs a table's cells together. A pasted table (a spreadsheet's HTML, or a Markdown table) becomes one line per row, its cells joined by " · "; what is around it pastes as usual.
- **Lifetime.** URLs live only in the block JSON, and nothing enqueues `storage_cleanup_jobs` for them, so images in mail already sent keep working.
  - That is a review invariant.
  - Recalling an image posted by mistake is a manual lever (I4).

### C5. Personalization

- **No `{nombre}` in phase 3** (K1).
- The email opens with "¡Hola Ana!", using `safeGreetingName(getUserName(user))` (`invitation-helpers.ts:105`), read when the batch is rendered. Without a usable name it says "¡Hola!".
- The inbox never greets, as gift items don't.
- **One body for everyone keeps three things simple:**
  - the fan-out is one set-based INSERT per chunk;
  - an edit is one set-based UPDATE;
  - the preview is exact.
- **A name that changes between two attempts of one batch** changes that batch's body. If the first attempt landed, Resend answers 409 and the rows are recorded `sent` / `idempotent_replay` (D3). Otherwise the new body goes out.

### C6. Action button

- **Optional:** a label of 1–30 characters and a **Glitter path**, never an external URL, as PRD §7's "Links are always paths inside Glitter" says. External links go in the text.
  - The rule is stricter than the schema CHECK `notifications_action_path_relative` (`db/schema.ts:7235-7238`), which only checks `LIKE '/%'` and so accepts `//evil.example`. The real guard is `safeActionPath` (below).
- **The path rule** is `/^\/(?![\/\\])[^\s\x00-\x1f\x7f]*$/`, the same rule as the CHECK in A4.
  - Browsers strip tabs and newlines while parsing a URL, so `"/\t/evil.example"` would become `//evil.example`.
  - Both `<Link href>` (`notification-detail.tsx:49-52`) and `new URL(path, request.url)` (`open/route.ts:19`) would follow it.
  - `safeActionPath` (`definitions.ts:121-126`) gains the same rule, which protects every kind.
- **Composer field:** "Página de Glitter", placeholder "/my_participations", hint "Pegá un enlace de Glitter. Para enlazar otro sitio, ponelo en el texto."
- **Where it appears:**
  - in the email, a `Button` with the absolute URL;
  - on the detail page, as the item's one action (`notification-detail.tsx:49-53`);
  - tapping the item always opens its detail (`opensDetail`).

---

## D. Sending pipeline

### D1. Starting a send: `startComunicadoSend(tx, comunicadoId, { by, trigger: "now" | "schedule", expectedVersion?, typedCount? })` in `app/lib/comunicados/send.ts`

It runs **in the caller's transaction**. "Enviar ahora" calls it inside `db.transaction`. The release calls it inside the transaction that holds its `FOR UPDATE SKIP LOCKED` (E2), so a second pooled connection never waits on the first one's lock.

1. `SELECT … FROM comunicados WHERE id = $1 FOR UPDATE`.
2. **Check the state:**
   - **`now`:** `status IN ('draft','scheduled') AND version = $expectedVersion`.
     - `status = 'sent'` returns `{ alreadySent: true }`, and the action answers success: "Este comunicado ya se está enviando." A double click is one send.
     - Another version: "El borrador cambió desde que abriste la confirmación. Revisalo y confirmá de nuevo."
   - **`schedule`:**
     - It requires `status = 'scheduled' AND scheduled_at <= now()` (database clock); otherwise `{ claimed: false }`.
     - Lateness is checked first (E4).
     - `scheduled_by_user_id` must still be a user with `role = 'admin'`, otherwise the refusal is `SENDER_NOT_ADMIN`.
3. **Read and render under the lock:**
   - `normalizeAnnouncementDoc(doc, { stage: "send" })` on the working copy, then `html` and `text`;
   - the email size check, with a stand-in recipient;
   - the essential rules (B7) and the audience (B1: every list exists and its filter parses);
   - with email ticked outside development, `publicBaseUrl()` must be `https:` and not localhost.
4. `INSERT notification_campaigns (type 'comunicado', status 'processing', title, message, created_by_user_id = by, idempotency_key = 'comunicado:{id}') RETURNING id`.
5. **Snapshot the recipients** (B4) and read back the counts. Any refusal throws and rolls everything back:

   | Code                     | When                                      |
   | ------------------------ | ----------------------------------------- |
   | `AUDIENCE_TOO_LARGE`     | more than 3,000 eligible before narrowing |
   | `NO_ELIGIBLE_RECIPIENTS` | 0 eligible                                |
   | `AUDIENCE_CHANGED`       | `typedCount` applies and differs          |

6. `INSERT comunicado_revisions (revision 1, title, doc, html, text, action, created_by_user_id = by)`.
7. `UPDATE comunicados SET` the following:
   - `status = 'sent'`, `campaign_id`, `current_revision = 1`;
   - `sent_at = now()`, `sent_by_user_id = by`, `audience_summary`;
   - `essential_confirmed_*` for `now` (a schedule already set them);
   - **`schedule_missed_at = NULL, schedule_missed_reason = NULL, schedule_missed_detail = NULL`**, so a draft that came back from a missed schedule can be sent;
   - `version = version + 1`.

**Retries.** A 40P01 or 23503 retries the whole transaction once (B4).

**Typed refusals** are `SendRefusal` errors with a code and a Spanish message:

- for "Enviar ahora", the action returns them;
- for the release, E4 records them.

**After the commit** ("now" only): `after(() => runComunicadoWork({ scope: { campaignId }, deadline: actionStartedAt + SEND_AFTER_DEADLINE_MS }))` (D9).

### D2. Fan-out: `processComunicadoChunk(campaignId, comunicadoId, passed)` in `app/lib/comunicados/fanout.ts`

```
candidates := SELECT id, user_id FROM notification_campaign_recipients
              WHERE campaign_id = $c AND status = 'pending' AND id <> ALL($passed)
              ORDER BY user_id LIMIT 250                                        -- no lock
BEGIN
 1. SELECT pg_advisory_xact_lock_shared(COMUNICADO_LOCK_NS, $k)                 -- own statement; an edit/retract (exclusive) waits for this chunk
 2. SELECT current_revision, retracted_at, send_email, send_push FROM comunicados WHERE id = $k
      → retracted: COMMIT and stop (the retraction already skipped every pending recipient)
      → load revision current_revision: title, text → excerpt, action
 3. SELECT id, role, status FROM users WHERE id = ANY($userIds) ORDER BY id FOR KEY SHARE
 4. SELECT id, user_id, source FROM notification_campaign_recipients
      WHERE id = ANY($candidateIds) AND status = 'pending' FOR UPDATE SKIP LOCKED     -- a concurrent runner's rows go to `passed`
 5. SELECT user_id FROM pending_user_deletions WHERE user_id = ANY($) AND local_deleted_at IS NULL
 6. classify with B5 rows 1–6; skip any `source` outside (list, person, staging_admin) as "No es participante", an allowlist, so a NULL or unknown source never gets an inbox row or a push; and re-apply row 7 by this process's VERCEL_ENV with the `source` read in step 4 (B6)
 7. notifyMany(tx, { kind: "comunicado", data, userIds: eligible, dedupeKey: `comunicado:${k}`, campaignId: c,
                     email: sendEmail ? "bulk" : null, push: sendPush })
 8. UPDATE notification_campaign_recipients r SET status = 'notified', notification_id = v.nid, attempts = r.attempts + 1,
      processed_at = now() FROM unnest($rids, $nids) v(rid, nid) WHERE r.id = v.rid
    UPDATE … SET status = 'skipped', skipped_reason = v.reason, processed_at = now() FROM unnest($rids, $reasons) v …
COMMIT
```

The advisory locks use the two-integer form, as `lockFestivalTermsDocument` does (`app/lib/reservations/locks.ts:124-128`).

**Lock order:**

- **A chunk takes:** the comunicado lock (shared) → users (`FOR KEY SHARE`, id order) → its recipient rows → new inbox and delivery rows.
- **Profile deletion:**
  - takes the user `FOR UPDATE` first (`app/api/users/actions.ts:177-184`);
  - the cron's claim transaction locks **several** users `FOR UPDATE` in due-date order (`app/lib/profile_tasks/actions.ts:257-269`);
  - its local delete then cascades to that user's recipient, notification and delivery rows (`:363-376`).
- **Edit and retract:** the comunicado lock (exclusive), then notifications, deliveries and recipients. They never lock users.
- **Chunk against deletion:**
  - `FOR KEY SHARE` conflicts with the deletion's `FOR UPDATE`. Either the deletion waits for the chunk, or the chunk waits and then finds the user gone: step 3 does not return them, and step 4 finds the recipient row cascaded away.
  - Against the cron's multi-user claim, whose order differs from ours, a cycle is possible though rare. Those users are mostly unverified and already skipped at the snapshot.
  - **Deadlocks are possible and retried** (below).
- **Ordinary profile edits are not blocked:** `FOR NO KEY UPDATE` is compatible with `FOR KEY SHARE`.
- **Fairness.** Postgres queues heavyweight locks, and a new shared request waits behind a queued exclusive one, so a stream of chunks and batches cannot starve an edit.

**`notifyMany(tx, input)`** is a new export of `app/lib/notifications/notify.ts`, next to `notify()`, with the same contract.

- `data` is validated once with the kind's schema; an invalid one throws `notification_data_invalid:<kind>`.
- The copy is built once by `buildInAppCopy`, and `startsRead` is honoured.
- The insert is `ON CONFLICT (user_id, dedupe_key) DO NOTHING`, and a person who already has the row gets no new deliveries (the semantics of `notify.ts:80-98`).
- **(a) Inbox rows:**
  ```sql
  INSERT INTO notifications (…) SELECT u.id, … FROM unnest($ids::int[]) t(id) JOIN users u ON u.id = t.id
  ON CONFLICT … DO NOTHING RETURNING id, user_id
  ```
  Rows that already existed are read back by `(user_id, dedupe_key)`.
- **(b) Email rows** (`email: "bulk"`):
  ```sql
  INSERT INTO notification_deliveries (notification_id, user_id, template_key, channel, lane, recipient_email, payload, idempotency_key)
  SELECT n.id, n.user_id, 'comunicado', 'email', 'bulk', u.email, $payload, 'notification:' || n.id || ':email'
  FROM unnest($newNids) … JOIN users u …
  ```
  The address is read in SQL, never passed as a parameter, so the query logger (`db/index.ts:60-64`) never prints 2,000 addresses.
- **(c) Push rows**, when `notificationPushes(kind, data, { push })` (D6):
  - one `INSERT … SELECT FROM push_subscriptions ps JOIN unnest($uids, $nids) t(user_id, nid) ON ps.user_id = t.user_id ORDER BY ps.id FOR KEY SHARE OF ps`;
  - lane `bulk`, payload `{}`, key `notification:{nid}:push:{psId}` (the semantics of `notify.ts:117-138`);
  - created at fan-out, so their 48 h TTL from `created_at` is right (`push/send.ts:141-145`).
- It returns `{ notificationIdByUser, pushDeliveryIds }`.
- It costs about 4 statements per chunk. 2,000 recipients is 8 chunks, a few seconds.

**Resume, idempotency and failure:**

- **A crash** rolls the chunk back whole. The rerun picks the same pending rows, and `unique(user_id, dedupe_key)` plus `unique(campaign_id, user_id)` make duplicates impossible.
- **Transient errors** spend no attempt. SQLSTATE `40P01`, `40001`, `55P03` and `57014`, and connection errors, retry the chunk once in the run; after that it is left for the next run.
- **Any other throw:**
  - one small update adds 1 to its candidates' `attempts` and records `last_error` (the error type), `WHERE status = 'pending'`;
  - the same candidates are then retried **one at a time** in that run, so a poison row fails alone;
  - a row becomes `failed` at 3 attempts (the pattern of `recordRecipientFailure`, `credit_gifts/service.ts:524-539`).

**Completion: `completeComunicadoIfDone(executor, c)`.** Three statements, so the last two get a fresh snapshot after the row lock:

```sql
SELECT status FROM notification_campaigns WHERE id = $c FOR UPDATE;          -- waits for a retry that is reopening it
SELECT EXISTS (SELECT 1 FROM notification_campaign_recipients WHERE campaign_id = $c AND status = 'pending')
    OR EXISTS (SELECT 1 FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
               WHERE n.campaign_id = $c AND d.channel = 'email' AND d.status IN ('pending','processing'));
UPDATE notification_campaigns SET status = 'completed', completed_at = now(), updated_at = now()
WHERE id = $c AND status = 'processing';                                     -- only when the second statement found nothing
```

- **Callers:** every driver, for each campaign it touched; the lane tick, sweeping up to 20 `processing` comunicado campaigns oldest first on `notification_campaigns_processing_idx` (`db/schema.ts:7166-7168`); and the retraction, as the last statement of its transaction (F3).
- Pushes are not waited for: a push released for a key mismatch can wait an hour.

### D3. The bulk email lane: `app/lib/notifications/bulk-email.ts`

The lane is generic over a renderer registry, `BULK_EMAIL_RENDERERS = { comunicado: comunicadoBatchRenderer }`. The comunicado renderer lives in `app/lib/comunicados/delivery.ts`, and PR 2's tests register a fixture renderer. Each renderer also supplies the lane-wide `<scope>` (for comunicados, the environment filter of D9), so `bulk-email.ts` itself never reads `comunicados`. One batch is one comunicado, one revision and at most 100 rows.

**Step 0, expiry** (the start of every email step):

```sql
UPDATE notification_deliveries
SET status = 'failed',
    last_error = CASE WHEN status = 'pending' AND maybe_sent_at IS NULL THEN 'expired' ELSE 'outcome_unknown' END,
    maybe_sent_at = CASE WHEN status = 'processing' THEN coalesce(maybe_sent_at, now()) ELSE maybe_sent_at END,
    lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
WHERE lane = 'bulk' AND channel = 'email'
  AND (status = 'pending' OR (status = 'processing' AND lease_expires_at < now()))
  AND created_at <= now() - interval '20 hours';
```

- A row found `processing` had an attempt that never settled, so it is marked `maybe_sent_at` here, as the claim would mark it (S1). The claim never re-takes it once it is older than 20 h, so without this a batch that landed and then lost its settle would read "Venció sin enviarse" and could be retried by hand.
- No bulk email is ever sent more than 20 h after its row was written. Its key is minted after that, so **no key is ever re-submitted after Resend's 24 h window** (`resend.ts:32-33`), whatever happened in between: a quota stall, a missing cron on a preview, an operator hold.
- An `expired` row can be retried by an admin; an `outcome_unknown` one cannot (G6).

**S1, the claim** (a short transaction, committed before any request leaves):

1. **A held batch first:** a key with at least one due row is re-claimed **whole**, every row of it that is unsettled and not under a live lease, whether or not each row is due. Rows of one key can carry different backoffs (their attempt counts differ); taking only the due ones would send part of the batch under the key, and the rest would later come back as a 409 and be recorded sent although no request carried them. Rows found `processing` with an expired lease had an attempt that never settled, so they are marked `maybe_sent_at`:
   ```sql
   UPDATE notification_deliveries SET status = 'processing', lease_owner = $o,
          lease_expires_at = now() + interval '5 minutes', updated_at = now(),
          maybe_sent_at = CASE WHEN status = 'processing' THEN coalesce(maybe_sent_at, now()) ELSE maybe_sent_at END
   WHERE batch_key = (SELECT batch_key FROM notification_deliveries
                      WHERE lane = 'bulk' AND channel = 'email' AND batch_key IS NOT NULL AND <dueNow>
                        AND created_at > now() - interval '20 hours' <scope>
                      ORDER BY next_attempt_at, id LIMIT 1)
     AND (status = 'pending' OR (status = 'processing' AND lease_expires_at < now()))
     AND created_at > now() - interval '20 hours'
   RETURNING *;
   ```
2. **Otherwise, a fresh batch:** the oldest due comunicado's next 100.
   ```sql
   WITH picked AS (
     SELECT d.id FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
     WHERE d.lane = 'bulk' AND d.channel = 'email' AND d.batch_key IS NULL AND <dueNow>
       AND d.created_at > now() - interval '20 hours'
       AND n.campaign_id = coalesce($scopeCampaign,
             (SELECT n2.campaign_id FROM notification_deliveries d2 JOIN notifications n2 ON n2.id = d2.notification_id
              WHERE d2.lane = 'bulk' AND d2.channel = 'email' AND d2.batch_key IS NULL AND <dueNow on d2>
              ORDER BY d2.id LIMIT 1))
     ORDER BY d.id LIMIT 100 FOR UPDATE OF d SKIP LOCKED)
   UPDATE notification_deliveries d SET status = 'processing', lease_owner = $o,
          lease_expires_at = now() + interval '5 minutes', batch_key = $newKey, updated_at = now()
   FROM picked WHERE d.id = picked.id RETURNING d.*;
   ```

- `<dueNow>` is the predicate at `deliveries.ts:62-69`, which uses the database clock. `<scope>` is the send's own campaign. Lane-wide, it is the renderer's scope: for comunicados, the campaigns whose `comunicados.audience_summary->>'env'` equals this process's `VERCEL_ENV` (D9), and the subquery that picks the oldest comunicado applies it too.
- `$newKey = 'comunicado-batch:{campaignId}:{uuid}'`. `sendBatchEmails` scopes it by `VERCEL_ENV` and hashes it past 256 characters (`resend.ts:40-46`).
- **The key is committed with the claim.** A batch that dies mid-request comes back after its lease with the same key and the same rows, now marked `maybe_sent_at`, and Resend deduplicates it if it had landed.

**Before S2** (outside any transaction): if `deadline − now < BULK_BATCH_RESERVE_MS` (25 s), release the claim (below) and stop.

**S2, the send.** One transaction on `tx` throughout; nothing in it uses `db`.

```
BEGIN
SET LOCAL lock_timeout = '<max(1 s, min(15 s, deadline − now − 25 s))>'   -- for the next statement only
SELECT pg_advisory_xact_lock_shared(COMUNICADO_LOCK_NS, $k)        -- own statement: fixes WHICH revision is rendered; waits behind an edit/retract
SET LOCAL lock_timeout = DEFAULT                                   -- the settle after the request never times out
SELECT pg_try_advisory_xact_lock(BULK_LANE_NS, 0)                  -- false → ROLLBACK, sleep 500 ms outside, retry S2 until the reserve
SELECT current_revision, retracted_at, essential, <festival name>, title/doc of that revision FROM comunicados …
pre-check (one query, below) → UPDATE the rows that fail (batch_key stays, as history)
render each sendable row → { from, to, replyTo, subject, html, text, headers?, tags }
sendBatchEmails(emails, { idempotencyKey: batch_key, batchValidation: "permissive" })   -- the wrapper retries one 429 (D4)
settle every row in one UPDATE … FROM (VALUES …) WHERE lease_owner = $o
wait BULK_BATCH_SPACING_MS (1.5 s), still holding the lane lock
COMMIT
```

- **Lock order.** The comunicado lock comes first, so a batch never holds the lane while waiting behind an edit. The lane lock is a try-lock, so no connection waits on it. An edit or retraction takes only the comunicado lock, so the two cannot cycle.
- **Spacing under the lane lock** guarantees at least 1.5 s between any two bulk requests, whatever the number of drivers. That is at most `1 / (H + 1.5 s)` requests per second, where H is the lock hold (render plus request, about 0.8–2.8 s): about 0.23–0.43 requests per second.
- **A batch whose pre-check leaves no sendable row** settles without a request and without the wait.
- **The lock timeout** covers only the comunicado lock. It is clamped to at least 1 s, because `'0'` turns the timeout off and a negative value makes the `SET` fail.
- **Releasing a claim.** Only an interruption **before** the Resend request releases a claim with nothing marked: the reserve reached first, `lock_timeout` on the comunicado lock, try-lock exhaustion, or a D2 transient SQLSTATE. A short transaction sets the claim's rows back to `pending`: lease cleared, key and `maybe_sent_at` kept, `next_attempt_at = now()`. Rows of a retracted comunicado become `skipped` `retracted` instead.
- **Any other error before the request** (a render or a pre-check that throws) spends an attempt: the rows go back to `pending` with the unknown-outcome backoff, `min(15 min, 30 s·2^(n−1))`, keeping the key only when `maybe_sent_at` is set, and at 5 attempts end `failed` with `render_failed` (or `outcome_unknown` when `maybe_sent_at` is set). The backoff lets every other due batch go first, so one broken comunicado cannot stall the lane.
- **Any failure after the request** (the settle, the commit, the process dying) leaves the rows `processing`, never released. The re-claim after the lease then marks them `maybe_sent_at` (S1).

**Pre-check** (the first match wins; an allowlist, so missing rows and NULLs fail closed):

```sql
SELECT d.id, d.user_id, CASE
  WHEN k.retracted_at IS NOT NULL OR n.retracted_at IS NOT NULL                          THEN 'retracted'
  WHEN u.id IS NULL OR r.id IS NULL                                                      THEN 'not_eligible'
  WHEN EXISTS (SELECT 1 FROM pending_user_deletions p
               WHERE p.user_id = u.id AND p.local_deleted_at IS NULL)                    THEN 'deleting'
  WHEN NOT coalesce(
         (r.source = 'list'          AND u.role = 'user' AND u.status IN ('verified','paused'))
      OR (r.source = 'person'        AND ((u.role = 'user' AND u.status IN ('verified','paused'))
                                          OR (u.role = 'admin' AND u.status <> 'banned')))
      OR (r.source = 'staging_admin' AND u.role = 'admin' AND u.status <> 'banned'), false) THEN 'not_eligible'
  WHEN $sendingEnv <> 'production'
       AND r.source IS DISTINCT FROM 'person' AND r.source IS DISTINCT FROM 'staging_admin' THEN 'staging'
  WHEN lower(btrim(d.recipient_email)) <> lower(btrim(u.email))                          THEN 'address_changed'
  ELSE <comunicadoEmailExclusion(d.recipient_email, essential => k.essential)>           -- 'suppressed' | 'unsubscribed' | NULL
END AS skip,
<announcementOptOutOverridden(d.recipient_email, k.essential)> AS overridden,
u.first_name, u.last_name, u.display_name
FROM notification_deliveries d
JOIN notifications n ON n.id = d.notification_id
JOIN comunicados k ON k.campaign_id = n.campaign_id
LEFT JOIN users u ON u.id = d.user_id
LEFT JOIN notification_campaign_recipients r ON r.campaign_id = n.campaign_id AND r.user_id = d.user_id
WHERE d.id = ANY($claimed) AND d.lease_owner = $o;
```

| Pre-check result                                                                 | Row becomes                      | Report                                                                           |
| -------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `retracted`, `not_eligible`, `deleting`, `staging`, `suppressed`, `unsubscribed` | `skipped` with that code         | G6 labels                                                                        |
| `address_changed`                                                                | `failed` with `address_changed`  | can be retried when `maybe_sent_at IS NULL`, and goes to the address on file now |
| `isDeliverableEmail` false (checked in code)                                     | `skipped` with `invalid_address` |                                                                                  |

**A superseded revision is not a skip reason:** every row renders the revision that is current under the lock.

**Render per row:**

- `render(<ComunicadoEmail revision greetingName unsubscribeUrl essentialNote stagingNote />)`;
- `text` is the revision's text with URLs, plus the action URL and the unsubscribe page URL;
- **headers:** `unsubscribeLinks({ kind: "user", id }, "announcements").headers` (`unsubscribe-links.ts:26-41`), **except on `overridden` rows** (D7);
- `from: COMUNICADOS_FROM` (outside production `COMUNICADOS_FROM_STAGING`), `replyTo: COMUNICADOS_REPLY_TO` (K3);
- `subject` is the revision title, prefixed with `getEnvLabel()` outside production (`app/lib/config.ts:3-7`);
- `tags: [{ name: "category", value: "comunicado" }, { name: "comunicado_id", value: String(k) }]`, as invitations do (`invitations.ts:328-331`).

Unsubscribe tokens are deterministic (`unsubscribe-tokens.ts:12-16`), so an unchanged retry renders the same bytes.

**`SendBatchOptions`** (`resend.ts:102`) gains `batchValidation?: "strict" | "permissive"`, passed through to the SDK (`node_modules/resend/dist/index.d.mts:661-686`). In permissive mode one bad address fails only itself instead of all 100.

**Outcomes** (`bulkBatchOutcome(response)`, extending `resendOutcome`, `invitation-helpers.ts:72-93`). Every outcome that is not accepted writes `last_error`. "Drop the key" means `batch_key = NULL`, so the rows rejoin the fresh pool under a new key; it applies only while `maybe_sent_at IS NULL`.

| Resend result                                                                                                                                                                                                                         | Rows become                                                                                                                                                                                                                                                                                                                                                                                      | Attempt   | Key             | Driver                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------------- | ------------------------------------------------------------------------------------- |
| **200**                                                                                                                                                                                                                               | `sent`, `sent_at`, `provider_message_id` by index, `content_revision` = the rendered revision. Permissive `errors[]` indexes become `failed` `resend:item_rejected` with `maybe_sent_at = NULL`: a 200 under this key proves those were not delivered. When the ids and errors do not add up to the payload, every row instead ends `failed` `outcome_unknown` with `maybe_sent_at` set (below). | —         | kept as history | continue                                                                              |
| **409** `invalid_idempotent_request` (an earlier attempt under this key landed, `resend-result.ts:18-39`)                                                                                                                             | `sent`, `last_error = 'idempotent_replay'`, `content_revision` NULL                                                                                                                                                                                                                                                                                                                              | —         | kept            | continue                                                                              |
| **unknown:** our 10 s timeout, `application_error`, `internal_server_error`, `concurrent_idempotent_requests`, an error without a name (the SDK passes any JSON error body through), any other 5xx that is not a quota or config code | `pending`, `maybe_sent_at = coalesce(maybe_sent_at, now())`, backoff `min(15 min, 30 s·2^(n−1))`; at 5 attempts `failed` `outcome_unknown`                                                                                                                                                                                                                                                       | spent     | kept            | continue                                                                              |
| `rate_limit_exceeded` (after the wrapper's own retry)                                                                                                                                                                                 | `pending`, `next_attempt_at = now() + make_interval(secs => least(86400, greatest(2, ceil(retryAfterMs / 1000))))`: `retryAfterMs` is the Retry-After in milliseconds (`retryAfterMs()`, `resend-result.ts`), converted to seconds once; a missing one is NULL, which `greatest` skips, so the wait is 2 s                                                                                       | not spent | drop            | sleep Retry-After (≤ 5 s) within the budget; after 3 in one run, stop the email step  |
| `daily_quota_exceeded` / `monthly_quota_exceeded`                                                                                                                                                                                     | This batch: `failed` `resend:<code>` when `maybe_sent_at IS NULL`, otherwise `pending` +1 h (the expiry bounds it). **Every other never-batched pending email of the campaign** also becomes `failed` `resend:<code>`.                                                                                                                                                                           | not spent | drop            | stop the email step lane-wide for this run; log `[comunicados] Resend quota exceeded` |
| config: `invalid_api_key`, `missing_api_key`, `restricted_api_key`, `invalid_from_address`, `security_error`                                                                                                                          | `pending`, +15 min                                                                                                                                                                                                                                                                                                                                                                               | not spent | drop            | stop the email step; `console.error` with the code only                               |
| other refusal (`validation_error` and the like: nothing went out)                                                                                                                                                                     | `pending`, backoff; at 5 `failed` `resend:<code>`                                                                                                                                                                                                                                                                                                                                                | spent     | drop            | continue                                                                              |
| development (`simulated`, `resend.ts:127-141`)                                                                                                                                                                                        | `sent`, `last_error = 'simulated'`, `content_revision` set                                                                                                                                                                                                                                                                                                                                       | —         | —               | continue                                                                              |

- **Index mapping.** In permissive mode, `data[i]` belongs to the i-th payload index not listed in `errors`.
  - If `data.length + errors.length` differs from the payload size, or an error index is out of range, repeated or not an integer, the answer says neither which rows went nor which were refused. Every row of the batch then ends `failed` with `outcome_unknown` and `maybe_sent_at` set: none is recorded sent, none is retried by hand, the key stays, and the report reads "Puede haber llegado". `[comunicados] batch id mismatch` is logged.
  - A recorded-response test pins this, and a preview with a deliberately bad address checks it once.
- **Logging.** Batch errors log `name`, `statusCode` and the number of failed indexes, never `errors[].message`, which can echo an address. The transactional worker keeps only the type for the same reason (`deliveries.ts:225-226`).

**Invariants:**

- **V6.** A row's key is minted in a committed claim before any request carries it, and is never given to other rows.
  - It is dropped only while no attempt under it may have landed.
  - Once `maybe_sent_at` is set, the row stays in that batch under its key: it is never re-batched under a new key and never picked by "Reintentar fallidos". It may end `sent`, `failed` (`outcome_unknown` or `resend:<code>`, or the pre-check's `address_changed`) or `skipped` by the pre-check, and the report shows "Puede haber llegado" unless it is `sent`. The exceptions are a per-item refusal in a 200 whose answer adds up, which clears `maybe_sent_at` (`resend:item_rejected`, retryable), and a retraction, which skips pending rows directly (F3 step 4).
  - A held batch only ever shrinks.
  - No row is sent more than 20 h after it was written.
  - So a 409 means that an earlier request under this key was accepted, and every surviving row was in it. It does not prove each of those rows was delivered: in permissive mode Resend may have refused one of them on its own, and the 409 does not say which. Those rows are recorded `sent` with `idempotent_replay` and reported as not confirmed per person (G6). A key is never re-submitted after Resend could have forgotten it.
- **V7.** "Reintentar fallidos" never selects a row with `maybe_sent_at` set (G6).

### D4. Keeping transactional email first

Comunicado email never queues ahead of transactional email, and it uses under half a request per second of Resend's limit. A rate-limit collision costs one wrapper retry of at most 2 s (item 2). A batch does not wait for transactional email to go quiet.

1. **Lanes** (`app/lib/notifications/deliveries.ts`):
   - `processPendingNotificationDeliveries` (`:410-424`) and `sendDuePushDeliveries` (`:347-390`, used by the cron's push pass and by `drainDuePushDeliveries`) add `lane = 'transactional'`;
   - `claimDelivery` (`:71-83`) adds `NOT (lane = 'bulk' AND channel = 'email')`, so no explicit-id or legacy path can send a bulk email on its own;
   - bulk push stays claimable per row, which is how D5 sends it;
   - so a comunicado backlog can never sit ahead of a gift email in the first-in-first-out queue.
2. **Every sender retries a throttle once, in the wrapper.**
   - `sendEmail` and `sendBatchEmails` (`resend.ts:48-99,117-169`) retry a `rate_limit_exceeded` response once, after `min(2 s, Retry-After)`, with the same payload and key. A 429 means nothing was accepted, so the retry is safe.
   - Error responses carry the headers (`node_modules/resend/dist/index.mjs:1323-1336`).
   - This one change covers the notification worker, both outboxes (`app/lib/reservations/notification-outbox.ts:608-688`; `app/lib/infractions/notifications.ts:677-700`) and every inline sender that tries once, such as order confirmations (`app/lib/orders/order-emails.ts:36-54`) and tickets (`app/lib/visitors/tickets.ts:138-158`).
   - Today the outboxes spend an attempt on a 429 and wait for their crons, every 5 and every 15 minutes (`vercel.json`). The inline senders lose the email.
   - Worst case per call: about 0.5 s + 2 s + 10 s, which keeps the gift path's 30 s + 55 s budgets (`credit_gifts/actions.ts:132-142`) under 100 s.
3. **The notification worker** (`runDelivery`'s catch, `deliveries.ts:219-229`):
   - `EmailSendError` (`resend-result.ts:45-56`) gains `retryAfterMs`, read from `result.headers["retry-after"]`;
   - a `rate_limit_exceeded` that survives the wrapper's retry returns the row to `pending` **without spending an attempt**, with `next_attempt_at` set by SQL to `now() + make_interval(secs => least(86400, greatest(2, ceil(retryAfterMs / 1000))))` (milliseconds converted to seconds once; a missing Retry-After is NULL, which `greatest` skips, so 2 s; at most a day), on the database clock that `dueNow` compares with (`deliveries.ts:56-69`; today the backoff comes from the app clock, `:151,227`). This applies only while `created_at > now() - interval '20 hours'`, so its key stays inside Resend's window;
   - quota and other codes keep today's handling;
   - the expectation in `gifts.integration.test.ts:651-656` (a 429 spends an attempt) flips.
4. **Pacing and single flight for bulk:** one bulk request in flight across servers, with 1.5 s of spacing under the lane lock (D3).
   - Bulk takes at most about 0.43 requests per second of Resend's per-team limit, under 5 % of 10 per second. Resend's docs (checked 2026-10-24) give a default of 10 requests per second per team, across all API keys; older Resend pages said 2 or 5. The account's actual value is on Resend → Settings → Usage. This pacing stays safe even at 2 per second.
   - Festival invitations are a second bulk sender (`invitations.ts:646-655, 768-770`) outside this lock. Their collisions are absorbed by the wrapper retry (item 2).
5. **A separate cron.** Bulk work never runs inside `/api/cron/morning/notifications`. Its 75 s budget, its passes and its pinned test (`app/api/cron/morning/notifications/route.ts:9,31-40`; `route.test.ts:46-84`) stay exactly as they are.

### D5. Bulk push

- **Function:** `sendBulkPushes({ campaignId?, budgetMs, concurrency: BULK_PUSH_CONCURRENCY })` in `deliveries.ts`.
- **Without VAPID keys it returns at once,** as `sendDuePushDeliveries` does (`deliveries.ts:362-364`). Otherwise it would claim rows only to hand them back as `unconfigured` for an hour (`push/send.ts:146-147`).
- **Selection:** `SELECT id FROM notification_deliveries WHERE lane='bulk' AND channel='push' AND <dueNow> <scope> ORDER BY id LIMIT 400`. `<scope>` is D3's, so lane-wide it takes only this environment's campaigns.
- **Sending:** a pool of 8 runs the existing `attemptClaimedDelivery` and `settlePush` (`deliveries.ts:135-145, 241-297`), with no sleeps, and starts nothing new once the budget is spent.
- **Every P2b rule is unchanged:** TTL, release on key mismatch, a 429 with Retry-After without spending an attempt, `deleting`, `archived`, `read`, and the flags for the recipient's role (`push/send.ts:130-276`).
- **A new skip reason `retracted`,** checked before `archived` (`push/send.ts:195`), so the report can tell a retracted push from one the person archived.
- **Time:** about 25–40 pushes per second, so 500 devices take about 15–20 s.
- **Connections** are held only for the short queries, never across a push request. The pool of 5 (`db/index.ts:84`) queues the rest for milliseconds.

### D6. Push only when ticked: the registry change

- `KindDefinition.push` (`app/lib/notifications/kinds/types.ts:48`) becomes `push?: true | "per_send"`.
- `notificationPushes(kind, data, opts?: { push?: boolean })` (`registry.ts:247-253`):
  ```ts
  if (def.startsRead?.(data)) return false;
  return def.push === true || (def.push === "per_send" && opts?.push === true);
  ```
- `notify()` gains `push?: boolean`, honoured only for `"per_send"` kinds. `notifyMany()` takes it per call.

**Changes to `registry.test.ts`:**

- "every participant kind pushes unless its fixture starts read" (`:271-302`) becomes "… unless it starts read **or pushes per send**";
- a new test, "a comunicado pushes only when its sender asked";
- `FIXTURES … satisfies Record<NotificationKind, unknown>` (`:233`) gains `comunicado` and `comunicado_not_sent`;
- the admin-link rule (`:250-256`) is met: `comunicado_not_sent` links under `/dashboard/communications/`.

### D7. List-Unsubscribe, footer, essential and staging marks

- **Headers.** Every comunicado email carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` for the topic `announcements`, except the `overridden` rows of an essential send.
  - Those people already unsubscribed. A one-click press would be a no-op (`suppressions.ts:168-179`; `app/api/email/unsubscribe/route.ts:26-44`) that Gmail shows as "Unsubscribed" before the next essential email arrives.
  - They get the footer link to the page instead, which explains the exception (H6).
- **Footer.** `EmailFooter({ unsubscribeUrl, notes? })` (`app/emails/email-footer.tsx:5-33`) gains optional note lines above the unsubscribe line. The existing "¿No querés recibir más correos como este? Darme de baja" stays.
- **Essential note:** "Es un correo esencial sobre tu participación en {festival}: llega también a quienes se dieron de baja de los anuncios."
- **Staging marks** (every environment except production; also on the test send):
  - the subject is prefixed with `getEnvLabel()`, giving "[Prev] Cambio de horario de armado";
  - the From display name becomes "Productora Glitter (prueba)";
  - a footer note reads: "Este correo salió del entorno de prueba de Glitter. Darte de baja acá no cambia nada en los correos del sitio real de Glitter; si no esperabas recibirlo, respondé a este correo."
- **The override** is the single `essential` argument of `comunicadoEmailExclusion` in the pre-check. `essential` cannot change after the send starts.
- **`EmailCopy` and the transactional `runDelivery` do not change:** the bulk lane builds its own Resend payload.

### D8. Send-time checks, in one place

| Where                                            | Checks                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Snapshot (D1)                                    | B5 rows 1–7; the cap; empty; the essential rules, including a current festival; the typed count; the base URL                                                                                                                                                                                                |
| Fan-out chunk, under the user lock (D2)          | retracted (stop); B5 rows 1–6; row 7 by the chunk's own env                                                                                                                                                                                                                                                  |
| Each email step and claim (D3)                   | expiry (20 h): in Step 0 and in the claim filter, not under the comunicado lock; only this environment's campaigns when lane-wide (D9)                                                                                                                                                                       |
| Each email batch, under the comunicado lock (D3) | retracted; no recipient row or no source; deleting; not eligible for its `source`; `staging` by the sender's env (allowlist); address changed; suppressed (never bypassed); unsubscribed from `all`, or from `announcements` unless essential; invalid address. **The text is always the current revision.** |
| Each push (D5)                                   | the existing P2b checks plus `retracted`                                                                                                                                                                                                                                                                     |

The gift-only `giftWasRevoked` guard (`deliveries.ts:106-114,153-162`) stays as it is; comunicado rows never take that path.

### D9. Who drives the work, and where

`runComunicadoWork({ scope, deadline })` in `app/lib/comunicados/driver.ts` runs these steps in order, checking the deadline between units:

1. **Lane scope only:** release due schedules, at most 3 (E2), and record the late and refused ones (E4).
2. **Fan-out:** the scoped comunicado, or every `processing` comunicado campaign that still has pending recipients, oldest first, at most 5.
3. **Bulk push:** at most 20 s.
4. **Bulk email:**
   - the expiry step (D3), then batches until less than `BULK_BATCH_RESERVE_MS` (25 s) is left;
   - skipped lane-wide in development;
   - skipped outside development when `publicBaseUrl()` is unusable, with a `console.error`.
5. **Completion:** every campaign it touched, plus, in lane scope, the sweep of `processing` comunicado campaigns (D2).

**Only its own environment's campaigns.** Lane-wide, steps 2–4 (fan-out, bulk push selection, bulk email claims) take only campaigns whose `comunicados.audience_summary->>'env'` equals this process's `VERCEL_ENV`. A scoped run is its own campaign, written by the same environment.

| Trigger                                                                                                                           | Scope              | Deadline            | Where                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The send action's `after()` (also "Reintentar fallidos")                                                                          | its own comunicado | action start + 85 s | every environment                                                                                                                                  |
| Cron `/api/cron/morning/comunicados`, `* * * * *` in `vercel.json`, auth `isAuthorizedCronRequest` (`app/lib/cron/auth.ts:14-34`) | the whole lane     | 75 s                | production (Vercel runs crons there only)                                                                                                          |
| "Procesar envíos pendientes", global admin and the flag, run in `after()`                                                         | the whole lane     | 80 s                | previews only (`VERCEL_ENV === 'preview'`); single flight: disabled while pending, and `consumeActionRateLimit("comunicados-process", 1 per 30 s)` |

- **Why a per-minute cron of its own:**
  - it never shares the transactional cron's budget or its tested pass order;
  - scheduled sends get one-minute precision;
  - `standHoldExpiration` already runs every minute (`vercel.json`).
- **Overlapping runs are safe:**
  - claims are `SKIP LOCKED`;
  - the lane lock is a try-lock with spacing under it;
  - releases and completions are compare-and-set.
  - The last batch starts by 50 s and ends by about 65–70 s.
- **Development:** only a send's own `after()` drains its own comunicado, simulated. A dev server pointed at a shared database cannot mark other people's queued mail as sent.
- **Previews:** a narrowed audience (the admins plus the people picked) is one or two batches, so the send's `after()` finishes it. Retries, held batches and schedules need the button, or the cron called by hand (I3).

### D10. Throughput for 2,000 recipients (production)

| Step                    | Unit                                                                                           | For 2,000                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Snapshot                | one `INSERT … SELECT`                                                                          | 0.3–1.5 s, inside "Enviar"                  |
| Fan-out                 | 8 chunks of 250, about 0.5 s each                                                              | about 4 s; inbox rows appear chunk by chunk |
| Push (only when ticked) | about 500 devices, 8 in flight                                                                 | about 15–20 s                               |
| Email                   | 20 batches of 0.3–0.8 s render + 1–2 s request + 1.5 s spacing ≈ 2.9–4.4 s each, one at a time | about 60–90 s of lane time                  |

- **Without push:** the `after()` (deadline 85 s, last batch by 60 s) sends about 12–18 batches, and the next one or two cron runs finish the rest.
- **With push:** about 8–11 batches in the `after()`.
- **Either way, 2,000 emails go out in about 2–3 minutes.**
- **A scheduled send** has no `after()`. The first cron run sends 6–15 batches after the release, fan-out and push; later runs send 11–17. That is about 2–3 minutes.
- **Today, for comparison:** about 1,000 per hour.
- **If rendering proves slow** in PR 5's measurement, render once per revision and substitute the escaped greeting and unsubscribe URL per row (the nonce-sentinel technique).

### D11. Test send ("Enviarme una prueba")

`sendComunicadoTestAction(comunicadoId)`:

- checks `canMutateAdminReservations`, `featureFlagGuard("comunicados")` and `consumeActionRateLimit("comunicado-test:{adminId}")` (5 per 10 minutes);
- runs `normalizeAnnouncementDoc(…, { stage: "send" })` on the **working copy** and renders it through the same email renderer, greeting the acting admin;
- sends with `sendEmail` to the acting admin's own address, with the subject "[Prueba] {título}" (prefixed with `getEnvLabel()` outside production), the staging marks of D7, and the key `comunicado-test:{id}:{uuid}`;
- the unsubscribe link is real, so the opt-out flow can be tested end to end;
- writes no delivery and no inbox row, so it never touches dedupe or the report.

Toast: "Te enviamos la prueba a d•••@gmail.com." In development: "En desarrollo no se envían correos: quedó registrado en la consola."

To try the inbox and push for real, the admin picks themselves by name and sends.

---

## E. Scheduling

### E1. States and transitions

```
            Programar (CAS status='draft', version)          release by cron (CAS status='scheduled', scheduled_at<=now())
  (new) → draft ──────────────────────────────► scheduled ───────────────────────────────────────────► sent
            ▲ ▲  ◄── Cancelar programación ─────── │  │ ◄── Cambiar fecha (CAS status='scheduled', version)
            │ │      (CAS status='scheduled')      │  └──┘
            │ └── missed at release (late, too_large, empty, invalid, sender_not_admin): schedule_missed_* ─┘
            └──────────── Enviar ahora (CAS status IN (draft, scheduled), version; clears schedule_missed_*) ──► sent
  Descartar borrador: DELETE FROM comunicados WHERE id=$1 AND status='draft'
  sent: campaign processing ──(D2 completion)──► completed;  retracted_at and new revisions are overlays on sent
```

| Action                | Statement (one transaction)                                                                                                                                                                                                                                                                                                                                                                                                | When it loses the race                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Programar             | Validate content (C2, send stage), audience (B1), counts (≤ 3,000, not empty), the essential rules, and the typed count when ≥ 300 or essential. Then `UPDATE comunicados SET status='scheduled', scheduled_at=$at, scheduled_by_user_id=$a, schedule_missed_at=NULL, schedule_missed_reason=NULL, schedule_missed_detail=NULL, essential_confirmed_*=…, version=version+1 WHERE id=$id AND status='draft' AND version=$v` | "Este comunicado cambió mientras lo mirabas. Recargá la página."            |
| Cambiar fecha         | `… SET scheduled_at=$at, version=version+1 WHERE id=$id AND status='scheduled' AND version=$v`                                                                                                                                                                                                                                                                                                                             | "Ya se empezó a enviar."                                                    |
| Cancelar programación | `… SET status='draft', scheduled_at=NULL, scheduled_by_user_id=NULL, essential_confirmed_by_user_id=NULL, essential_confirmed_at=NULL, version=version+1 WHERE id=$id AND status='scheduled'`                                                                                                                                                                                                                              | "Ya se empezó a enviar. Si no querés que llegue, retiralo."                 |
| Enviar ahora          | D1 with `trigger: 'now'`, from draft or scheduled                                                                                                                                                                                                                                                                                                                                                                          | idempotent                                                                  |
| Autosave              | `… WHERE id=$id AND status='draft' AND version=$v`                                                                                                                                                                                                                                                                                                                                                                         | "Este borrador cambió en otra pestaña. Recargá para ver la última versión." |

- **Development cannot schedule.** "Programar" and "Cambiar fecha" are refused when `VERCEL_ENV` is development: "En desarrollo no se puede programar: nada lo enviaría." No cron runs there, and a schedule written to a shared or production database would later be released by that database's own cron, unnarrowed (K9).
- **A scheduled comunicado is frozen:** no autosave, and no change to the audience or the channels. It opens read-only with a banner: "Está programado. Para cambiar el texto o los destinatarios, cancelá la programación." This removes every race between an edit and the release.
- **Every transition carries its status** in the WHERE, because here the action sends email. The blog's cancel and reschedule do not (`app/lib/posts/actions.ts:642-649, 673-681`).

### E2. The trigger

Step 1 of the lane-scoped `runComunicadoWork`, in the per-minute cron and behind the preview button:

```sql
BEGIN;
SELECT id, version, scheduled_at FROM comunicados WHERE status = 'scheduled' AND scheduled_at <= now()
  AND id <> ALL($triedThisTick)
ORDER BY scheduled_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;      -- served by comunicados_scheduled_idx
-- startComunicadoSend(tx, id, { trigger: 'schedule' }) in this same transaction (D1): it sends as
-- scheduled_by_user_id, read under this lock, and refuses when that person is no longer a global admin (E4)
COMMIT;
```

- It repeats up to 3 times per tick, and starts no release with less than 10 s left before the run's deadline.
- **Never in development** (K9): a dev server's run skips this step, so nothing releases a shared database's schedules from there. Previews do release, with their own narrowing.
- **Each iteration skips the ids already tried in this tick.** One comunicado that throws an unexpected error cannot hold back later ones; it stays scheduled until it becomes `late` (E4).
- **A cancel that committed first wins.** An overlapping run skips the locked row; once committed, the row reads `sent`.
- **Due-ness uses the database clock,** as the queue does (`deliveries.ts:62-69`).

### E3. Freezes

- **Content:** revision 1 is taken from the working copy, read and rendered under the release's row lock (D1 step 3).
- **Audience:** resolved at release (B8). Someone added to a list after scheduling receives it.
- **Typed count:** there is no comparison at release, since nobody is there to type. The audience is whatever the lists hold then, still capped (K14).

### E4. Lateness and refusals at release

**When the release does not send:**

- it is more than 60 minutes late (`now() − scheduled_at > 60 min`, for example after a cron outage);
- the send throws a typed `SendRefusal`. Each maps to a missed reason:

  | Refusal                                             | Missed reason      |
  | --------------------------------------------------- | ------------------ |
  | `AUDIENCE_TOO_LARGE`                                | `too_large`        |
  | `NO_ELIGIBLE_RECIPIENTS`                            | `empty`            |
  | content, audience, essential or base-URL validation | `invalid`          |
  | `SENDER_NOT_ADMIN`                                  | `sender_not_admin` |

**What it does then:**

- The release transaction rolls back.
- A new transaction records the miss **at the first failure**:
  ```sql
  UPDATE comunicados SET status='draft', scheduled_at=NULL, schedule_missed_at=now(), schedule_missed_reason=$r,
         schedule_missed_detail=$sentence,
         essential_confirmed_by_user_id=NULL, essential_confirmed_at=NULL,   -- as "Cancelar programación" does
         version=version+1
  WHERE id=$id AND status='scheduled' AND version=$v      -- $v read under the release's lock; a change of date or a send in between wins
  ```
  - Clearing the essential confirmation keeps the draft editable: `comunicados_essential_confirmed` has no draft exemption, so unticking "Correo esencial" would otherwise fail every autosave.
- If that updated a row, the **same transaction** writes the `comunicado_not_sent` item (G9), so a crash cannot record the miss and lose the bell item:
  - to `scheduled_by_user_id` when that person is still a global admin;
  - otherwise to every global admin.
  - A global admin is any user with the role `admin`, whatever their status, as `startComunicadoSend` and the actions check it. Both lookups run in the miss's transaction; `fetchAdminUsers` (`app/lib/users/queries.ts:173-185`) is not used, since it reads outside it and answers an error with nobody.
- An **unexpected** error (not a typed refusal) leaves the comunicado scheduled, so the next tick retries it until it becomes `late`. The release does not try it again in the same tick (E2), so later schedules still go out. 40P01 and 23503 were already retried inside D1.
- The draft shows the same sentence as a banner until it is scheduled or sent again. Sending it works (D1 step 7).

**Why there is a limit:** "mañana el armado empieza a las 8:00" sent two days late does harm, and nothing marks which comunicados are time-critical, so the limit applies to all (K5). The blog has no cap (`app/lib/posts/schedule.ts:12-15`), which suits an article but not an anuncio.

### E5. Time zone

- **The picker:** `ScheduleDialog` (`app/components/blog/schedule-dialog.tsx`) is generalized:
  - `onConfirm(at)` replaces the hard-wired `schedulePost` (`:20,84`);
  - `STORE_TIMEZONE` (`app/lib/formatters.ts:3-4`) replaces its own `ZONE` (`:22`);
  - it keeps parsing a `datetime-local` value as America/La_Paz whatever the browser's zone (`:43-50`);
  - the default is the next full hour plus one.
- **Storage:** the instant, in the repo's naive-UTC `timestamp` convention. Bolivia has no daylight saving time, so no local time is ambiguous.
- **Validation** (server clock): at least now + 5 minutes, at most now + 60 days.
- **The time is always shown afterwards** with `formatDateTime`: "Programado para el sábado 31 de octubre, 09:00 (hora de Bolivia)", on the list row, the badge and the page.
- **Dialog copy:** "Horario de Bolivia (La Paz). Se envía dentro del minuto siguiente a la hora elegida. Si por algún problema se atrasa más de una hora, no se envía y queda como borrador."

### E6. Previews, and overdue schedules everywhere

- **On previews,** scheduling writes the same rows, but nothing fires by itself. The dialog adds: "En el entorno de prueba no corren las tareas programadas: después de la hora elegida tocá «Procesar envíos pendientes»."
- **In every environment,** a comunicado still `scheduled` 3 minutes after its time shows, on the list row and on its page: "Debería haber salido el sáb 31 oct, 09:00 y todavía no salió." It offers **Enviar ahora**, and on previews also **Procesar envíos pendientes**. A broken cron in production is visible the same way.
- **The 60-minute limit applies on previews too,** so waiting an hour is a way to test the missed path.

---

## F. Edit and retract after sending

### F1. Edit: `editSentComunicado(id, { expectedRevision, title, doc, actionLabel, actionPath, editNote? }, by)` in `app/lib/comunicados/edit.ts`

- **Who:** a global admin, with the flag.
- **What can change:** only the title, the text and the button. The audience, the channels and the essential mark are fixed once sent.
- **When:** while the campaign is `processing` or `completed`; refused once retracted.
- **Essential comunicados** require `editNote`: "Contá por qué cambia un correo esencial (lo ve solo el equipo)." The amber essential callout is repeated in the dialog (G7).

The content is normalized and rendered (C2, send stage; C3) before the transaction. Then one transaction, with `SET LOCAL lock_timeout = '20s'`; a 40P01 retries once:

1. `pg_advisory_xact_lock(COMUNICADO_LOCK_NS, id)`, exclusive, in its own statement. It waits for the chunk or batch in flight, at most about 15 s (render, one Resend call with its throttle retry, the 1.5 s spacing). Later chunks and batches queue behind it.
2. `SELECT … FROM comunicados WHERE id = $1 FOR UPDATE`. It requires `status = 'sent' AND retracted_at IS NULL AND current_revision = $expectedRevision`. Otherwise:
   - "Alguien más lo editó recién. Recargá para ver la última versión."
   - "Este comunicado fue retirado."
3. `INSERT comunicado_revisions (revision n+1, …, edit_note, created_by_user_id, created_at = clock_timestamp())`.
4. `UPDATE comunicados SET current_revision = n+1, title, version = version+1, updated_by_user_id`, and `UPDATE notification_campaigns SET title, message, updated_at`.
5. **Inbox**, set-based. It reaches every row written by chunks that committed before step 1.
   ```sql
   UPDATE notifications
   SET title = $t, body = $excerpt, action_path = $p, action_label = $l, edited_at = now(),
       data = data || jsonb_build_object('revision', $n1, 'title', $t, 'excerpt', $excerpt,
                                         'actionPath', $p, 'actionLabel', $l)
   WHERE campaign_id = $c AND kind = 'comunicado' AND retracted_at IS NULL;
   ```
   - Chunks after the edit write revision n+1 with no `edited_at`, since those people never saw the old text.
   - `read_at` is left alone (K7).
6. **Emails: nothing to do.** This is the equivalent that decision 7 allows, and it guarantees that unsent emails carry the new text:
   - pending and claimed rows render the current revision when their batch takes the shared lock, which can only happen after this commit;
   - a held batch is re-sent with the new body under its old key. If the old request landed, Resend answers 409 and the rows are recorded `sent` / `idempotent_replay`; otherwise the new text goes out and `content_revision = n+1` (D3);
   - sent rows keep their `content_revision` (decision 7: they stay).
7. **Push:**
   - pending pushes render from the row (`push/payload.ts:64-98`), so they carry the new title;
   - delivered pushes keep the old title on the device;
   - the service worker's cache of the last 5 arrivals (`public/sw.js:28-31,152-188`) may offer the old title once in the iPhone toast, and a tap opens the current item.
8. **On lock timeout:** "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos."

### F2. What an edit reaches

| Surface                             | Effect                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbox list                          | new title and excerpt, "· Editado", the next time the list loads: opening the bell, coming back to the tab, navigating (`notification-inbox.tsx:152-155`; `notification-popover-content.tsx:73-80`). The 60 s poll reads only the unread count (`use-unread-notification-count.ts:8,12,69`), which an edit does not change. Read state kept |
| Detail page                         | the current revision's HTML at once, plus "Editado el 25 de octubre, 10:12"                                                                                                                                                                                                                                                                 |
| Rows written after the edit         | revision n+1, no "Editado"                                                                                                                                                                                                                                                                                                                  |
| Email pending or claimed            | renders n+1 when sent                                                                                                                                                                                                                                                                                                                       |
| Email held after an unknown outcome | re-sent with n+1 under the old key: 409 means an earlier request was accepted ("Enviado (sin confirmación por persona)"); otherwise n+1 goes out                                                                                                                                                                                            |
| Email sent                          | stays; the report shows "versión 1"                                                                                                                                                                                                                                                                                                         |
| Push pending / delivered            | new title / stays on the device                                                                                                                                                                                                                                                                                                             |
| Report                              | "Historial": "Versión 2 · editada por Ana el 25 oct., 10:12 · «Cambió el horario de armado»"                                                                                                                                                                                                                                                |

### F3. Retract: `retractComunicado(id, { reason }, by)` in `app/lib/comunicados/retract.ts`

- **Who:** a global admin, with the flag.
- **Reason:** required, 1–300 characters, internal.
- **When:** while `processing` or `completed`, once.

One transaction, with `SET LOCAL lock_timeout = '20s'`; a 40P01 retries once:

1. The exclusive advisory lock, in its own statement, then `FOR UPDATE`. It requires `status = 'sent' AND retracted_at IS NULL`.
2. `UPDATE comunicados SET retracted_at = now(), retracted_by_user_id = $by, retract_reason = $r, version = version+1`.
3. `UPDATE notifications SET archived_at = coalesce(archived_at, now()), retracted_at = now() WHERE campaign_id = $c AND kind = 'comunicado' AND retracted_at IS NULL`. Every read hides them (A2), and `read_at` is kept for the report.
4. `UPDATE notification_deliveries d SET status = 'skipped', last_error = 'retracted', updated_at = now() FROM notifications n WHERE d.notification_id = n.id AND n.campaign_id = $c AND d.status = 'pending'`. This covers email and push.
   - **`processing` rows are deliberately not touched,** because `settle()` checks only `lease_owner` and would overwrite them (`deliveries.ts:85-104`).
   - A bulk email in `processing` belongs either to a batch that has finished (we waited for its shared lock), or to one that was claimed, or one that crashed. Those meet `retracted` in their pre-check under the lock, or are released as `skipped` (D3).
   - A push in `processing` is mid-request: it is either delivered, or it hits the `retracted` skip.
5. `UPDATE notification_campaign_recipients SET status = 'skipped', skipped_reason = 'Retirado antes de enviarse', processed_at = now() WHERE campaign_id = $c AND status = 'pending'`. Later chunks see `retracted_at` under the shared lock and stop.
6. `completeComunicadoIfDone(tx, c)`, the last statement. It holds the exclusive lock, so its checks are exact. A campaign with claimed rows still `processing` is closed by the next driver or by the sweep (D2).

**Results:**

- A retracted item disappears from the list, the badge, mark-all, the chip and the detail page.
- A push tap or a bookmark reaches `/open` or the detail page, finds nothing visible, and redirects to the inbox, as any item that is gone does (`[notificationId]/page.tsx:28-31`; `open/route.ts:73-74`).
- The archive toast's "Deshacer", "Marcar como leída" and the "Deshacer" after "Marcar todo como leído" update nothing (A2).
- A retracted comunicado stays readable in the dashboard, with its revisions and report.
  - It can be duplicated, which is the usual fix: retract, duplicate, correct, send.
  - It cannot be edited or retracted again.

**What cannot be undone:**

- emails already handed to Resend (recorded `sent`);
- pushes already delivered. Their text is only the title and "Tocá para ver el detalle.";
- images in emails already sent (PR 8). The manual lever is in I4.

### F4. Concurrency matrix

| A ∥ B                                                   | Outcome                                                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| edit or retract ∥ fan-out chunk                         | Serialized by the advisory lock. Either the chunk writes revision _n_ and the edit then rewrites it, or the chunk runs after and reads _n+1_ (or the retraction, and stops). |
| edit or retract ∥ email batch                           | The batch's shared lock spans the Resend call. The edit waits up to about 15 s, and every later batch renders _n+1_ or skips `retracted`.                                    |
| edit ∥ edit                                             | Serialized; the second fails the `expectedRevision` check.                                                                                                                   |
| retract ∥ edit                                          | Serialized; whichever comes second is refused.                                                                                                                               |
| retract ∥ "Reintentar fallidos"                         | The retry takes the shared lock and checks `retracted_at`, so it is refused.                                                                                                 |
| retry ∥ retry                                           | Both take the shared lock, then the campaign row `FOR UPDATE`. The second waits, then re-selects in a later statement and finds nothing failed to retry.                     |
| retry ∥ completion                                      | Completion locks the campaign row first and checks in a later statement, so it sees the retry's reopened status and rows.                                                    |
| profile deletion ∥ chunk                                | The user row decides it (D2). The deleted person's rows cascade away. A rare deadlock with the cron's multi-user claim is retried.                                           |
| profile deletion ∥ batch                                | The batch holds no user lock. A delivery the deletion cascades away makes its settle update 0 rows; a pending deletion is in the pre-check.                                  |
| profile deletion ∥ snapshot                             | Foreign-key locks are taken in ascending order. A deletion committing mid-statement (23503) retries the send once.                                                           |
| profile deletion ∥ retract                              | A rare cycle is possible. Postgres aborts one side; the retraction retries once, then answers "Probá de nuevo"; the deletion cron retries on its next run. **Accepted.**     |
| cron release ∥ "Enviar ahora" ∥ cancel ∥ change of date | `FOR UPDATE` plus a compare-and-set on status, and on version for the miss: exactly one wins.                                                                                |
| two cron runs, or `after()` ∥ cron                      | Chunks take disjoint rows (`SKIP LOCKED`); one bulk request at a time with spacing (the try-lock); releases and completions are compare-and-set.                             |

### F5. Invariants the tests pin

- **V1.** After any committed edit, every non-retracted inbox row of the campaign has `data.revision = current_revision`, and its title and body match that revision.
- **V2.** No bulk email request carries a revision other than the one current when its batch took the lock, and none starts after a retraction has committed.
- **V3.** A retracted row is archived and cannot be un-archived (the CHECK). `updateOne`, `markNotificationRead` and `markNotificationsUnreadAction` update 0 rows.
- **V4.** After a retraction commits, no comunicado email can be requested, and no push whose inbox row was read after the retraction committed (bulk push takes no comunicado lock, so a push that read the row just before may still go out). No `pending` recipient remains. Every `pending` delivery is skipped. Claimed rows meet `retracted` in their pre-check, or are released as skipped.
- **V5.** At most one campaign per comunicado, and at most one recipient row and one inbox row per (comunicado, person).
- **V6, V7.** As stated at the end of D3.
- **V8.** The transactional drains never claim a bulk row, and `claimDelivery` refuses a bulk email.
- **V9.** A list filter that cannot be read fails the send; it never resolves to everyone.
- **V10.** Every `processing` comunicado campaign with no pending recipient and no pending or processing email is completed by the next lane tick.

### F6. The report after an edit or a retraction

- **Everything is kept:** every recipient and their `read_at`; every delivery's status, reason, `maybe_sent_at` and `content_revision`; the revision history.
- **After a retraction:**
  - the KPIs freeze;
  - a banner reads "Retirado el 25 oct., 11:02 por Dennis · Motivo: «…»";
  - cancelled emails read "Cancelado (retirado)", mapped from `last_error = 'retracted'`, unless `maybe_sent_at` is set ("Puede haber llegado", G6). This follows the `revoked` → cancelled precedent in `emailStateOf` (`credit_gifts/queries.ts:224-239`).

---

## G. Admin UX

### G1. Where it lives

| Route                                                                       | Page                                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/communications`                                                 | Comunicados list                                                                                                                            |
| `/dashboard/communications/[id]`                                            | A draft opens the composer. A scheduled one opens a read-only page of its own, with its actions (E1). A sent one opens its page and report. |
| `/dashboard/communications/[id]/edit`                                       | Edit after sending (no autosave)                                                                                                            |
| `/dashboard/communications/lists`                                           | Lists                                                                                                                                       |
| `/dashboard/communications/lists/new?kind=filter\|fixed`, `/lists/[listId]` | List editors                                                                                                                                |
| `/dashboard/communications/lists/festival/[festivalId]`                     | "Confirmados · \<festival\>", read-only (G8)                                                                                                |

- **Layout:** `app/dashboard/communications/layout.tsx` mirrors `credits/layout.tsx`.
  - h1 "Comunicaciones";
  - the line "Anuncios para participantes y las listas a las que se envían.";
  - a `CommunicationsNav` rail shaped like `CreditsNav` (`app/components/credits/admin/credits-nav.tsx:17-152`): **Comunicados** · **Listas** · **Regalos de créditos**. The last links to `/dashboard/credits/gifts`, as PRD §6 promised.
- **Navigation:**
  - desktop: a "Comunicaciones" entry in the admin "Dashboard" menu (`app/components/navbar/navigation-menu.tsx:300-417`, next to "Créditos"), with the text "Anuncios a participantes por la app, el correo y el dispositivo" once comunicados send (PR 5); until then "Borradores de comunicados y listas de participantes", and the flag's description likewise says only what has shipped;
  - mobile: the admin block (`app/components/organisms/mobile-sidebar.tsx:249-380`);
  - the flag is resolved in `navbar.tsx:32-47` with `isLayoutFeatureEnabled("comunicados")` (`app/lib/feature_flags/helpers.ts:52`) and passed through `navbar-client.tsx`, following `blogEnabled`. `navbar.tsx` has no profile in scope, so the role check is on the client, inside the existing admin blocks (`navigation-menu.tsx:300`, `mobile-sidebar.tsx:249`), as with `blogEnabled`.

### G2. Permission and flag checks (all on the server)

| Surface                                                                                                                                                                                                                                | Check                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every page in the area                                                                                                                                                                                                                 | `requireAdmin()` (`app/lib/users/helpers.ts:72-78`), else `notFound()`; then `requireFeatureEnabled("comunicados", viewer)` (`feature_flags/helpers.ts:90`). The dashboard layout admits festival admins (`app/dashboard/layout.tsx:21-26`), so each page re-checks, as `/dashboard/emails` does. |
| Every server action: draft create, autosave, discard, preview counts, people search, test send, schedule, change date, cancel, send, edit, retract, retry, duplicate, list create/update/archive/members, "Procesar envíos pendientes" | `canMutateAdminReservations(actor)` (`app/lib/reservations/policy.ts:62-66`) **and** `featureFlagGuard("comunicados")` (`feature_flags/helpers.ts:113`), before anything else                                                                                                                     |
| Report and list queries                                                                                                                                                                                                                | `requireAdmin()` inside the query                                                                                                                                                                                                                                                                 |
| `comunicadoImage` upload (PR 8)                                                                                                                                                                                                        | role `admin` and `isFeatureEnabled("comunicados")`                                                                                                                                                                                                                                                |
| Gift picker "Agregar una lista"                                                                                                                                                                                                        | `creditGiftBlocker`, the flag, and production (B9). Hidden from festival admins.                                                                                                                                                                                                                  |
| "Procesar envíos pendientes"                                                                                                                                                                                                           | all of the above, plus `VERCEL_ENV === "preview"` and its rate limit                                                                                                                                                                                                                              |
| Cron                                                                                                                                                                                                                                   | `isAuthorizedCronRequest`. **It ignores the flag:** a send someone confirmed finishes even if the flag is hidden halfway. The stops are "Cancelar programación" and "Retirar".                                                                                                                    |

- `admin_only` would also admit festival admins (`canPreviewUnlaunchedFeatures`, `app/lib/feature_flags/visibility.ts:27-31`, used at `:61-62`). That is why every check asks for the role as well as the flag (decision 2).
- **Festival admins see nothing of Comunicaciones in phase 3,** viewing included. That departs from gifts, where they see the pages with the button disabled (PRD §4, decision 1), so it is asked as K12. Read-only access later is a small change, because each page and query checks access in one place.

### G3. Comunicados list (`/dashboard/communications`)

- **Tabs:** "Borradores (2)" · "Programados (1)" · "Enviados". 25 per page, newest activity first.
- **Button "Nuevo comunicado":** it creates a draft and redirects, and stays disabled while pending.
- **Each row shows:**
  - the title, or _"Sin título"_;
  - a badge: "Borrador", "Programado · sáb 31 oct, 09:00", "Enviando…", "Enviado", "Retirado", "No se envió", plus the tags "Editado" and "Esencial";
  - "Para: Confirmados · Glitter Navidad 2026 y 3 personas";
  - once sent: "1.240 personas · 1.180 correos · 41 % leído";
  - "Enviado el sáb 24 oct, 10:12 · Dennis".
- **Overdue schedule:** E6's sentence on the row, with "Enviar ahora".
- **Empty state:** "Todavía no hay comunicados." / "Escribí el primero para avisar algo a los participantes: llega a sus notificaciones y, si querés, a su correo."
- **Banners, when they apply:**
  - preview: "Estás en un entorno de prueba: los comunicados a listas les llegan solo a los administradores. Las personas que elijas por nombre sí los reciben, con un correo real (marcado como prueba)." Next to it, the button "Procesar envíos pendientes" (single flight, D9).
  - development: "Estás en desarrollo: los comunicados a listas les llegan solo a los administradores, y las personas que elijas por nombre los reciben en la app. En desarrollo no se envían correos."

### G4. Composer (one page, no wizard; the gift composer's two-column layout, `credit-gift-composer.tsx:120-228`)

**Header:**

- "← Comunicados", then "Borrador";
- the save state: "Guardado" · "Guardando…" · "No se pudo guardar. Reintentamos en unos segundos.";
- "Descartar borrador", which asks "¿Descartar este borrador? No se puede deshacer."

**Autosave:** a 1.5 s debounce, with the `version` compare-and-set (E1) and the blog's guard pattern (`app/components/blog/post-form-inner.tsx:216-335`). Draft CHECKs never refuse a partial field (A4).

- One save at a time, always of what is on screen. Each carries a `saveKey`. When a request's outcome is unknown (it failed or lost its answer), the next request reuses its key, so the server recognises a save that did commit (A4 `autosave_key`) and answers `replayed`. The client then sends what is on screen again with a new key, and counts nothing as saved until a request's own fields are stored. A STALE is always a real conflict.
- A text far over the size limit is left out of the payload, so the other fields still save, and "El comunicado es demasiado largo. Acortá el texto." shows under Texto.
- After a release replaces the actions the page calls, autosave stops with "Se publicó una nueva versión de Glitter. Tus últimos cambios no se guardaron: copialos y recargá la página.", and leaving still warns.
- Leaving the composer flushes once (no retries after) and, when any save may have been stored, refreshes the router, so Back reopens the draft as stored and the list shows current titles. A discard skips it.
- The live audience count and the preview retry a failure on their own and show "Reintentar".

**Banners:**

- **`notifications` not public for participants:** "Las notificaciones de la app todavía no son públicas: por ahora a los participantes solo les llega el correo. Lo van a ver en la app cuando la campana se abra a todos."
- **A missed schedule:** the E4 sentence, with its detail.

**Card "Mensaje":**

- **Título:** a counter "0/80", the hint "Es el asunto del correo y el título de la notificación.", the placeholder "Por ejemplo: Cambio de horario de armado".
- **Texto:**
  - the `announcement` editor, with the placeholder "Escribí el anuncio. Podés usar títulos, listas y enlaces.";
  - a counter "1.204/5.000";
  - a server refusal shows inline (C2).
- **Botón (opcional):** the switch "Agregar un botón"; "Texto del botón" (placeholder "Ver mi reserva"); "Página de Glitter" (C6). A path with spaces shows "La dirección no puede tener espacios."

**Card "Destinatarios":**

- **"Agregar una lista"**, a combobox:
  - "Confirmados por festival": every festival, newest first, with its count, for example "Confirmados · Glitter Navidad 2026 · 312";
  - "Listas guardadas": name, a kind icon, count.
- **"Agregar por nombre o correo":**
  - `userSearchCondition` (`app/lib/users/search-condition.ts:10-28`), role `user` or `admin`, 8 results;
  - admins carry the tag "Administración";
  - on previews, everyone who is not an admin carries the tag "Recibe un correo real";
  - someone who cannot receive it shows disabled, with the reason, as in the gift picker.
- **Chips** per source, with "pueden recibirlo hoy" counts (B4).
- **Live summary:** a debounced `previewComunicadoAudienceAction(audience)`, the B4 SQL with `SELECT`. "**1.240 personas**", with "· 85 están en más de una lista (cuentan una vez)" and "· 14 no lo reciben [Ver por qué]". The link opens the counts by reason and the first 50 names.

**Card "Canales":**

- ☑ (fixed) **En la app**: "Siempre: queda en sus notificaciones de Glitter."
- ☑ **Por correo**: "1.194 de 1.240. No les llega a 30 que se dieron de baja de los anuncios, a 4 que pidieron no recibir ningún correo masivo ni a 12 con el correo bloqueado."
- ☐ **Notificación en el dispositivo**:
  - "Solo para algo urgente. Llega a los dispositivos de 352 personas que las activaron. Una vez que llega no se puede borrar."
  - When `push_notifications` is not public: "Todavía no está abierta a participantes: hoy solo les llegaría a quienes ya la tienen habilitada."
- **Correo esencial**, a switch:
  - enabled only when the audience is exactly one Confirmados list of a current or upcoming festival, and email is on (B7);
  - help: "El correo les llega también a quienes se dieron de baja de los anuncios (30 personas). No les llega a quienes pidieron no recibir ningún correo masivo (4) ni a los correos bloqueados (12): ellos lo ven en la app. Usalo solo para algo que cambia su participación en Glitter Navidad 2026, como el horario de armado. Queda registrado quién lo marcó y por qué.";
  - when on, "¿Por qué es esencial?", 10–300 characters, with the hint "Solo lo ve el equipo.";
  - otherwise a muted line: "Correo esencial: solo para un comunicado a un único «Confirmados · festival» de un festival en curso o próximo, con correo."

**Right column, "Vista previa"**, with tabs **Notificación** · **Detalle** · **Correo** · **Dispositivo** (the last only when push is on):

- **Notificación:** the real `NotificationItem` (static), with the excerpt.
- **Detalle:** the real `NotificationDetail`, with the server-rendered HTML.
- **Correo:**
  - the real template, rendered on the server for the acting admin ("¡Hola Dennis!"), with the subject above it, including the staging marks outside production;
  - the unsubscribe link is `?token=preview`, which the server refuses (`invitations.ts:483-485`);
  - it is shown in an iframe sandboxed without `allow-scripts` or `allow-same-origin` (`invitation-email-preview.tsx:113-115`).
- **Dispositivo:** a lock-screen card with "Glitter", the title and "Tocá para ver el detalle."

**Right column, "Enviar":**

- a summary: Personas · Por correo · En el dispositivo · No lo reciben;
- the buttons "Enviarme una prueba" (secondary), "Programar…" and "Enviar…";
- what is missing, as in gifts: "Falta un título, el texto, al menos un destinatario."

### G5. Confirm dialog ("Enviar…"; "Programar…" shares it)

It loads fresh numbers from the server when it opens:

> **¿Enviar «Cambio de horario de armado»?**
>
> |                      |                                                                                               |
> | -------------------- | --------------------------------------------------------------------------------------------- |
> | Pueden recibirlo hoy | **1.240 personas**                                                                            |
> | En la app            | 1.240                                                                                         |
> | Por correo           | 1.194 · 30 dados de baja de los anuncios · 4 sin correos masivos · 12 con el correo bloqueado |
> | En el dispositivo    | 352 personas (410 dispositivos), or "No"                                                      |
> | No lo reciben        | 14 · 8 perfiles no verificados · 4 cuentas suspendidas · 2 no son participantes               |

**Callouts, when they apply:**

- **Esencial (amber):** "Es un correo esencial: también les llega a las 30 personas que se dieron de baja de los anuncios. No les llega a las 4 que pidieron no recibir ningún correo masivo ni a los 12 correos bloqueados por rebote o spam: ellos lo ven en la app. Motivo: «El armado se adelanta a las 7:00 por la lluvia». Queda registrado a tu nombre."
- **Push:** "La notificación en el dispositivo no se puede borrar una vez que llega, aunque después edites o retires el comunicado."
- **Test environment (blue):**
  - preview: "Estás en un entorno de prueba: en lugar de las 1.240 personas de las listas, lo reciben los 4 administradores. Las 2 personas elegidas por nombre sí lo reciben, con un correo real marcado como prueba: Ana Pérez, Luis Rojas."
  - development: "… Las 2 personas elegidas por nombre lo reciben en la app (en desarrollo no se envían correos)."
  - "las 1.240 personas de las listas" counts who the lists reach and nobody picked by name: the preview's "pueden recibirlo hoy" less the people picked by name who can, so someone on a list and picked by name is counted once, among the latter. When the lists reach nobody else, it reads "en lugar de las listas, …".
- **`notifications` not public:** "Los participantes todavía no ven la campana: les llega solo el correo."

**Typed confirmation:** at ≥ 300 recipients, or for any essential send, "Para confirmar, escribí la cantidad de personas: 1240". The server re-checks it (B8). Below that, a normal dialog.

**Buttons:** "Volver" · "Enviar ahora" ("Enviando…").

**The schedule variant:**

- puts the date and time picker on top ("Horario de Bolivia (La Paz)");
- adds "La audiencia se calcula al momento del envío: hoy serían 1.240 personas.";
- labels its button "Programar para sáb 31 oct, 09:00".

**Server refusals:**

- `AUDIENCE_CHANGED`: "La audiencia cambió: ahora son 1.251 personas. Revisá y confirmá de nuevo." The dialog reloads its numbers.
- `AUDIENCE_TOO_LARGE`: "Por ahora un comunicado llega a 3.000 personas como máximo. Achicá la audiencia con una lista más precisa."
- `NO_ELIGIBLE_RECIPIENTS`: "Nadie de esta audiencia puede recibirlo."
- `ESSENTIAL_NOT_ALLOWED`: "Solo un comunicado a un único «Confirmados · festival» de un festival en curso o próximo, con correo, puede ser esencial."

**On success:** the toast "Lo estamos enviando." and the comunicado's page.

### G6. The comunicado page and report (`/dashboard/communications/[id]`, any comunicado that is not a draft)

**Header:**

- the title, the badges, and "Enviado el sáb 24 oct, 10:12 por Dennis · Editado el dom 25 oct, 10:12 por Ana";
- the essential block, when essential: "Correo esencial · Confirmados · Glitter Navidad 2026 · lo confirmó Dennis el sáb 24 oct, 10:11 · «…» · 30 personas dadas de baja de los anuncios lo recibieron igual · 4 sin correos masivos no.";
- "Destinatarios al enviar", from `audience_summary`: "Confirmados · Glitter Navidad 2026: 312 · Ilustradores: 845 · 3 personas por nombre".

| State     | Actions                                                                                    |
| --------- | ------------------------------------------------------------------------------------------ |
| Scheduled | **Enviar ahora** · **Cambiar fecha** · **Cancelar programación** · **Duplicar**            |
| Sent      | **Editar** · **Duplicar** · **Reintentar fallidos (N)** (only when N > 0) · ⋯ **Retirar…** |
| Retracted | **Duplicar**                                                                               |

**Banners.** All are derived from rows the page already reads:

- **Sending:** "Lo estamos enviando: ya está en la app de 820 de 1.240 personas y salieron 600 correos. Esta página se actualiza sola." It refreshes every 3 s for 2 minutes, then every 30 s, while anything is pending (the gift cadence, `credit-gift-auto-refresh.tsx:6-9`).
- **Stopped by configuration**, when the oldest pending bulk email's `last_error` is a config code: "Detenido: Resend rechazó el envío (clave o remitente). Avisale a quien administra Resend. Reintentamos cada 15 minutos; los correos que no salgan en 20 horas quedan como vencidos."
- **Quota**, when failed rows carry a quota code: "Resend no acepta más correos por ahora (límite del plan). Los correos que faltaban quedaron sin enviar: reintentalos con «Reintentar fallidos» cuando se renueve el límite."
- **Not moving**, when emails are pending and nothing settled in 10 minutes: "No avanza desde las 10:12." On previews it also offers "Procesar envíos pendientes".
- **Overdue schedule:** E6.
- **Retracted:** F6.
- **Test environment:** "Enviado en un entorno de prueba: las listas se reemplazaron por los 4 administradores."
- **Development:** "Simulado (desarrollo): no se envió ningún correo."

**KPI cards** (`CreditGiftKpi`, from one aggregate query over recipients joined with the latest email delivery):

| Card                | Value                                              |
| ------------------- | -------------------------------------------------- |
| Destinatarios       | 1.240 (sub: "14 no lo recibieron")                 |
| Leídos en la app    | 512 · 41 %                                         |
| Correos enviados    | 1.180 de 1.194                                     |
| Correos no enviados | 52 (sub: "34 bajas · 12 bloqueados · 6 con error") |
| Rebotes y spam      | 9 (sub: "0,8 % · desde este comunicado")           |
| En el dispositivo   | 395 de 410 (only when push was ticked)             |
| En cola             | 8 (only while sending)                             |

"Rebotes y spam" joins `email_suppressions` (`resend_email_id`, `db/schema.ts:5299-5300`) to this campaign's `provider_message_id`, through the unique `email_key` index. It counts a bounce or complaint whose latest event came from one of these emails. Its percentage is over the emails sent with a provider id: `idempotent_replay` rows have none and are not confirmed per person, so they are left out of the denominator.

**Cards:**

- "Mensaje", the current revision's HTML;
- "Historial", one row per revision, with "Ver" to open that revision rendered.

**Recipients table:**

- server-paged, 50 per page ("1–50 de 1.254", "Anterior" / "Siguiente"), ordered by name;
- filter chips: "Todos" · "No leídos" · "Correo no enviado" · "Omitidos" · "Con error", plus a search by name or email.

**Columns:**

- **Persona:** name and email.
- **Origen:** "Lista" · "Por nombre" · "Admin de prueba" (an admin substituted on a preview). List members on a preview keep "Lista", with the skip "Entorno de prueba: no se envía a listas".
- **App:** "Leído" · "No leído" · "Omitido: Cuenta suspendida" · "Retirado antes de enviarse" · "Falló".
- **Correo**, from the latest email delivery (a `LATERAL` join by `notification_id`, served by `notification_deliveries_notification_idx`). The first matching row wins:

  | Delivery state                                  | Label                                                            |
  | ----------------------------------------------- | ---------------------------------------------------------------- |
  | sent, `idempotent_replay`                       | Enviado (sin confirmación por persona)                           |
  | sent                                            | Enviado 10:14 (· versión 1 when older than the current revision) |
  | pending or processing, `maybe_sent_at` set      | En cola (puede haber llegado)                                    |
  | ended not sent, `maybe_sent_at` set, any reason | Puede haber llegado                                              |
  | pending, processing                             | En cola                                                          |
  | `unsubscribed`                                  | Se dio de baja de los anuncios / de los correos masivos          |
  | `suppressed`                                    | Correo bloqueado (rebote o spam)                                 |
  | `invalid_address`                               | Correo inválido                                                  |
  | `not_eligible`                                  | Ya no puede recibirlo                                            |
  | `deleting`                                      | Cuenta en eliminación                                            |
  | `staging`                                       | Entorno de prueba                                                |
  | `retracted`                                     | Cancelado (retirado)                                             |
  | failed, `expired`                               | Venció sin enviarse                                              |
  | failed, `address_changed`                       | Cambió su correo                                                 |
  | failed, `resend:*_quota_exceeded`               | Límite de Resend                                                 |
  | failed, other                                   | Con error                                                        |
  | no row, email unticked                          | Sin correo                                                       |
  | no row, recipient skipped                       | —                                                                |

- **Dispositivo:** "Enviada a 2" · "Sin dispositivos" · "—".

**"Reintentar fallidos (N)":**

- `consumeActionRateLimit("comunicado-retry:{id}")`, 1 per 5 minutes.
- One transaction:
  1. `pg_advisory_xact_lock_shared(COMUNICADO_LOCK_NS, k)`, in its own statement;
  2. refused if retracted;
  3. `SELECT … FROM notification_campaigns WHERE id = $c FOR UPDATE`, then `SET status = 'processing', completed_at = NULL`;
  4. in later statements:
     - recipients `failed` go back to `pending` with `attempts = 0`;
     - for each notification whose latest email delivery is `failed` **and `maybe_sent_at IS NULL`**, an `INSERT … SELECT` writes a new bulk row `notification:{nid}:email:retry:{uuid}`, with `resend_of_delivery_id`, `requested_by_user_id` and the address read as `u.email` in SQL. It never travels as a parameter.
- Then `after(runComunicadoWork(own))`.
- Dialog: "Reintentamos 6 correos y 2 personas que no llegaron a recibirlo, con el texto actual. No reintentamos los 3 correos que pueden haber llegado."

**"Duplicar":**

- a new draft with the current revision's title, text and button, `send_email` and the audience;
- never push, essential, its reason or the schedule;
- the composer opens with the banner "Copia de «…». Revisá los destinatarios antes de enviar."; the title itself is copied unchanged, with no "Copia de" prefix.

### G7. Edit and retract dialogs

**"Editar"** opens `/dashboard/communications/[id]/edit`, seeded from the current revision, with no autosave.

- The banner: "Estás editando un comunicado enviado. Podés cambiar el título, el texto y el botón. Los destinatarios y los canales quedan como están."
- The field "Nota del cambio (opcional, solo para el equipo)". It is required on an essential comunicado (F1).
- "Guardar cambios…" opens:

> **¿Guardar los cambios?**
> Se actualiza en las notificaciones de las 1.240 personas y se marca como «Editado».
> Correos: los 1.180 que ya salieron no cambian; los 8 que todavía no salieron se envían con el texto nuevo, salvo los que pueden haber llegado ya en un intento anterior.
> Las notificaciones que ya llegaron a los dispositivos no cambian.
> _Si el cambio es importante para quienes ya lo leyeron, mejor enviá un comunicado nuevo._
> [Volver] [Guardar cambios]

- While it is still sending, the dialog adds: "Todavía se está enviando: quienes no lo recibieron aún reciben directamente la versión nueva."
- On an essential comunicado, it repeats the amber callout: "Es un correo esencial: los correos que todavía no salieron llegan con el texto nuevo también a quienes se dieron de baja de los anuncios. Contá por qué en la nota."

**"Retirar…":**

> **¿Retirar «Cambio de horario de armado»?**
> Desaparece de las notificaciones de las 1.240 personas, también de quienes ya lo leyeron.
> Los 8 correos que todavía no salieron no se envían; 3 pueden haber llegado ya. Los 1.180 correos ya enviados y las notificaciones que ya llegaron a los dispositivos no se pueden borrar. El informe queda guardado.
> Motivo (solo para el equipo): [ ] (obligatorio, hasta 300 caracteres)
> [Volver] [Retirar comunicado]

- The counts follow the report's labels (G6): a row with `maybe_sent_at` set that is not `sent` counts under "pueden haber llegado", never under "no se envían".
- The devices are named only when "Notificación en el dispositivo" was ticked; without it the sentence is "Los 1.180 correos ya enviados no se pueden borrar." ("El correo ya enviado no se puede borrar." for one), and with no email sent either only "El informe queda guardado." follows.
- It is a plain confirmation, not typed: retracting removes rather than sends, and its worst outcome is recoverable with "Duplicar".
- Toast: "Lo retiramos de las notificaciones."

### G8. Lists pages

**`/dashboard/communications/lists`:**

- The line "Grupos de participantes para comunicados y regalos de créditos."
- **"Por festival":** one row per festival, past ones included, newest first, with a search.
  - Each row shows "Confirmados · \<festival\>", "Pueden recibirlo hoy: 312 · 8 no lo reciben", and "Ver".
  - The counts come from one `GROUP BY festival_id` over accepted reservations joined with the participant rule.
  - The explanation reads: "Quienes tienen una reserva confirmada en el festival, titulares y acompañantes. Se calcula en cada envío."
- **"Guardadas":** Nombre · Tipo ("Con filtros" / "Elegida a mano") · Pueden recibirlo hoy · ⋯ (Editar / Archivar).
  - The button "Nueva lista" offers "Con filtros (se calcula de nuevo en cada envío)" and "Elegida a mano (siempre las mismas personas)".
- **Empty state:** "Todavía no guardaste listas. Las de cada festival ya están arriba."

**Confirmados page** (`lists/festival/[festivalId]`, read-only):

- the festival's name and status, and the explanation above;
- members paged at 50, ordered by name, with "Titular" / "Acompañante" (both when a person is on two reservations);
- a person who cannot receive it today shows "No lo recibe ahora: \<motivo\>", with the B5 label;
- the count line matches the composer chip.

**Filter list editor:**

- Fields: Nombre (≤ 60), Descripción, **Área**, **Categorías**, **Departamento**, **Con reserva confirmada en** ("cualquiera de estos festivales"), **Sin reserva confirmada en**, and the switch **Incluir pausados**.
- A live panel: "Hoy pueden recibirlo **845** participantes", with the first 20 names. With no filters, "Sin filtros: son todos los participantes habilitados."

**Fixed list editor:**

- name and description;
- "Agregar por nombre o correo" (participants only);
- members paged at 50, with "Quitar" (at most 3,000 members);
- a member who cannot receive it today shows "No lo recibe ahora: Cuenta suspendida".

**Archivar:** "¿Archivar «Ilustradores»? Deja de aparecer al elegir destinatarios. Los borradores y los programados que la usan la siguen usando; los enviados no cambian."

### G9. Admin item in the bell: `comunicado_not_sent`

- **To:** `scheduled_by_user_id` when still a global admin, otherwise every global admin. Category Administración, in-app only.
- **Dedupe:** `comunicado-not-sent:{id}:{schedule_missed_at epoch}`.
- **Action:** "Ver comunicado" → `/dashboard/communications/{id}`.
- **Title:** "No se envió «{título}»".
- **Body, by reason:**
  - `late`: "Estaba programado para el sáb 31 oct, 09:00 y el envío se atrasó más de una hora. Quedó como borrador para que lo revises."
  - `too_large`: "Al enviarlo, {detalle}. Quedó como borrador." For example: "la audiencia sumaba 3.120 personas y el máximo es 3.000".
  - `empty`: "Al enviarlo, nadie de la audiencia podía recibirlo. Quedó como borrador."
  - `invalid`: "Al enviarlo, {detalle}. Quedó como borrador." For example: "la lista «Ilustradores» tiene un filtro que ya no se puede leer", or "el festival ya terminó y no puede ser esencial".
  - `sender_not_admin`: "La persona que lo programó ya no es administradora, así que no se envió. Quedó como borrador."

---

## H. Participant experience

### H1. Inbox item and the Anuncios chip

- **The item:**
  - the existing megaphone tile (`app/components/notifications/notification-icon.tsx:31-35`);
  - the title and two lines of excerpt (`notification-item.tsx:57-58`);
  - the time, an unread dot, and **"· Editado"** when `edited_at` is set. `InboxNotification` (`definitions.ts:89-106`) gains `editedAt`.
- **Tapping** opens its own page (`opensDetail`, PRD §7).
- **The chip is data-driven:**
  - `UNUSED_FILTERS` (`definitions.ts:54-60`) gives way to `visibleNotificationFilters(role, { hasAnnouncements })`;
  - the inbox page computes `hasAnnouncements` with one `EXISTS` under `visibleTo` and `category = 'announcements'`, next to its other reads;
  - so the chip appears the moment a person has an anuncio and never shows empty, with no launch-day code change;
  - `definitions.test.ts:19` becomes "shows Anuncios only once there is one to file there".

### H2. Detail page (`/my_notifications/[id]`)

- **Top:** "Anuncios · 24 oct. 2026, 18:02" (`notification-detail.tsx:26-29`), the title, and a muted "Editado el 25 de octubre, 10:12" when edited.
- **Body:** the current revision's sanitized HTML, through `RichTextHtml`.
  - `fetchNotificationForViewer` (`queries.ts:175-200`) adds `bodyHtml` for kind `comunicado`, joining `comunicados` on `data.comunicadoId` to `comunicado_revisions` at `current_revision`. It falls back to the plain body.
  - This generalizes the `KINDS_WITH_MESSAGE` path.
  - External links keep BlockNote's `target="_blank" rel="noopener noreferrer nofollow"`.
- **The action button,** if any. No sign-off (PRD §7).
- **Retracted or gone:** it redirects to the inbox, as today (`[notificationId]/page.tsx:28-31`).

### H3. Email

| Part      | Content                                                                                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| From      | `COMUNICADOS_FROM = "Productora Glitter <anuncios@productoraglitter.com>"`: the verified domain, a new local part, no DNS change; the name follows PRD §4 decision 9. Outside production, "Productora Glitter (prueba) <anuncios@…>". K3, K4. |
| Reply-To  | `soporte@productoraglitter.com`, the orders precedent (`order-emails.ts:64`). K3.                                                                                                                                                             |
| Subject   | the title; prefixed with "[Prev]" or "[Dev]" outside production                                                                                                                                                                               |
| Preheader | the excerpt, cut to 120 characters                                                                                                                                                                                                            |
| Body      | `EmailHeader`; "¡Hola Ana!" (or "¡Hola!"); the title as a heading; the rendered blocks (C3); the button, with an absolute URL                                                                                                                 |
| Footer    | `EmailFooter`: "Enviado por el equipo Glitter / © 2026 \| Productora Glitter, Santa Cruz, Bolivia / ¿No querés recibir más correos como este? Darme de baja". Essential sends and staging sends add their note lines (D7).                    |
| Headers   | `List-Unsubscribe` with one-click, topic `announcements`; left out only for an essential email to someone already unsubscribed from Anuncios (D7)                                                                                             |
| Text part | the full text with URLs, the button as "Texto: https://…", then "Darme de baja: \<url\>"                                                                                                                                                      |

### H4. Push (only when the admin ticked it)

- **Text:** the title (≤ 80), then "Tocá para ver el detalle.".
- **Tap:** `/my_notifications/{id}/open` marks it read and opens its page (PRD §10, P2b). A retracted item lands in the inbox.
- **Who receives it:** both `notifications` and `push_notifications` must be visible for the recipient's role at send time (`push/send.ts:201-202`). Until they are public, participants get no push even when it is ticked; the composer says so (G4).

### H5. What each situation means, channel by channel

| Situation                      | Inbox                                 | Email                                                                                                            | Push                                                         |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Normal                         | item under Anuncios, opens its detail | unless unticked, unsubscribed (Anuncios or all), suppressed, or no longer eligible                               | only if ticked, the device allowed it, and both flags are on |
| Essential                      | same                                  | even if unsubscribed from Anuncios (no one-click header then); never with the `all` opt-out; never if suppressed | same as normal                                               |
| `notifications` not public yet | written but not visible (no bell)     | yes                                                                                                              | skipped `push_off`                                           |
| Edited                         | new text, "Editado"                   | sent: old text; not yet sent: new text                                                                           | delivered: old title stays; pending: new title               |
| Retracted                      | gone; a link lands in the inbox       | sent stays; queued cancelled                                                                                     | delivered stays; pending cancelled                           |

### H6. Unsubscribe page copy (ships in PR 5, with the first essential send)

**Labels** (`app/lib/emails/topics.ts:19-32`). Both are `Record<EmailTopic, string>`, so the compiler forces them (PR 2):

- `EMAIL_TOPIC_LABELS.announcements = "los anuncios de Productora Glitter"`, which reads "Dejarás de recibir los anuncios de Productora Glitter en d•••@gmail.com.";
- `EMAIL_TOPIC_SHORT_LABELS.announcements = "Anuncios"`.

`/dashboard/emails` lists the topic automatically (`add-unsubscribe-dialog.tsx:32-38`). An Anuncios opt-out an admin records there before PR 5 is harmless: it is honoured later.

**`unsubscribe-card.tsx:100-103`**, for the topic `announcements` only (not `all`, which essential mail never overrides). The page passes `subject.topic` to the card, and the reassurance becomes:

> Seguirás recibiendo los correos que vos pidas, como tus entradas o reservas, y los correos esenciales sobre los festivales donde tenés un espacio confirmado, como un cambio en el horario de armado. Los anuncios seguirán apareciendo en tus notificaciones de Glitter.

- After "Te diste de baja" the same paragraph stays, so a later essential email is no surprise.
- An `all` opt-out keeps today's copy, which stays true.
- The blocked-address warning (`:86-98`) is unchanged and still true, since suppressions are never bypassed.

---

## I. Rollout and operations

### I1. The flag

`FEATURE_FLAGS.comunicados` (`app/lib/feature_flags/registry.ts:23-69`; no migration):

- `label`: "Comunicados";
- `defaultVisibility`: `"hidden"`;
- `description`: "Comunicaciones en el panel: escribir, programar y enviar comunicados a participantes, las listas de distribución y «Agregar una lista» en los regalos de créditos. Solo administradores globales. Mientras esté oculta, se habilita marcando a cada administrador. Ocultarla no frena lo ya confirmado: un envío se frena cancelando su programación o retirándolo."

**Rollout:**

- Target Dennis and the other global admins by name while it is hidden (targeting wins, `visibility.ts:52-66`).
- Moving to `admin_only` later is safe: every page and action also requires the role `admin`.
- Add a row to `docs/ARCHITECTURE-feature-flags.md:288-298`.
- The flag gates the admin side only. Participants see comunicados through `notifications` and `push_notifications`, as with every kind.

### I2. Launch order

1. **PR 2 (groundwork) reaches production first, alone, and soaks through at least one real credit gift.** It changes the transactional hot path: lane filters, the wrapper's 429 retry, the worker's throttle rule, and the migrate lock timeout. Check that transactional delay (I4 #2) does not move.
2. **`notifications` goes Pública** (the PRD §11 checklist) before any real comunicado to participants.
   - `push_notifications` goes public before the push checkbox means anything (the PRD P2b order).
   - Items written before the bell's launch appear unread at launch, as phase 1 and 2 items do (PRD §4 decision 14).
3. **PRs 3–8** land behind the hidden flag, each checked on a preview (I3).
4. **First production sends, graduated.** Between steps, check I4 #8: do not continue above 2 % bounces or 0.1 % complaints.
   1. by name, to an admin's own participant test account;
   2. a fixed list of about 20 trusted participants;
   3. a recent festival's Confirmados (300–500);
   4. the first 2,000.
5. **First gift from a list:** a fixed list of 2–3 trusted participants, checked on the gift page before any large list. Lists are disabled for gifts on previews (B9).

### I3. What to check on a preview

1. **Deploy and gifts:**
   - the deploy applies the migrations;
   - a credit gift to a participant test account still emails at once (the transactional lane is intact).
2. **Lists:**
   - a past festival's Confirmados counts owners and partners once each. Compare with `count(DISTINCT user_id)` by hand, read-only, after stating the database target (AGENTS.md);
   - a filter list's count moves with each attribute, departamento included;
   - a fixed list adds and removes people;
   - the counts match between the lists page, the Confirmados page and the composer chip.
3. **Gift picker:** "Agregar una lista" is disabled, with the staging reason.
4. **Composer:**
   - pasted colours or underline vanish on save;
   - a button path with a tab is refused;
   - the four preview tabs match the real inbox, detail page and email, in dark mode too.
5. **"Enviarme una prueba":**
   - it arrives as "[Prev] [Prueba] …" from "Productora Glitter (prueba)", with the staging footer note;
   - Reply-To, the button and the footer are right, and the links point at the preview's https host, not localhost;
   - Gmail → "Mostrar original" shows `List-Unsubscribe` and `List-Unsubscribe-Post`;
   - the 6th try in 10 minutes is refused.
6. **Send to "Confirmados · X" plus yourself by name:**
   - the dialog shows the test-environment callout;
   - the report shows list members as "Lista", skipped with "Entorno de prueba: no se envía a listas", and the substituted admins as "Admin de prueba";
   - inbox, email and push (if ticked) arrive.
7. **Unsubscribe and essential:**
   - one-click from the footer;
   - the next comunicado shows "Se dio de baja de los anuncios";
   - an essential one to a current festival's Confirmados still reaches you, with the footer note and no `List-Unsubscribe` header;
   - with an `all` opt-out recorded in `/dashboard/emails`, it does not;
   - essential is disabled for an archived festival;
   - an address on the suppression list is not mailed.
8. **One-click on a protected preview:**
   - `curl -X POST "<preview>/api/email/unsubscribe?token=…"` without Vercel credentials. If it answers 401 (Vercel's login), that is expected on staging only, and the footer note covers it;
   - with the `x-vercel-protection-bypass` header it answers 200.
9. **Edit after sending** ("Editar" on a sent comunicado):
   - the dialog's lines match the report's numbers;
   - the item shows "· Editado" and the new text, and the detail page shows "Editado el …";
   - the comunicado's header reads "Enviado el … por … · Editado el … por …";
   - "Historial" lists two versions, version 2 with its note and "Actual"; "Historial · Ver" on version 1 opens the text as it was sent;
   - saving without changing anything is refused: "No cambiaste nada: el comunicado sigue igual.";
   - editing an essential one requires the note;
   - a retracted comunicado offers no "Editar", and its `/edit` address opens its page.
   - Editing _while_ emails are queued is covered by PR 7's integration tests.
10. **Retract:**
    - the item disappears the next time the list loads (opening the bell, coming back to the tab, navigating), and the badge within 60 s when the unread count changes;
    - the archive toast's "Deshacer" and the "Deshacer" after "Marcar todo como leído" do nothing;
    - an old push tap lands in the inbox;
    - the report is intact, and the campaign shows "Retirado", not "Enviando…".
11. **Schedule, retry, duplicate:**
    - schedule 6 minutes ahead; the list and the page show the time in La Paz; 3 minutes after it the overdue banner appears on both, and "Procesar envíos pendientes" sends it;
    - schedule, wait more than an hour, press the button: back to draft, with the bell item;
    - then "Enviar ahora" on that draft works;
    - cancel a schedule, and change another's date;
    - "Reintentar fallidos (N)" on a preview, on a comunicado with a failed email row (for example after a "Con error"): the dialog says what it retries and what may have arrived, and the rows go back to "En cola" and are sent;
    - "Duplicar" from a retracted comunicado opens a new draft with the banner "Copia de «…». Revisá los destinatarios antes de enviar." and the same title (no "Copia de" prefix), text, button, email setting and recipients, push and essential unticked.
12. **Cron and topics:**
    - `curl -H "Authorization: Bearer $CRON_SECRET" -H "x-vercel-protection-bypass: $BYPASS" https://<preview>/api/cron/morning/comunicados` returns the step counts;
    - `/dashboard/emails` lists "Anuncios".
13. **Images:**
    - "Imagen" opens a panel with the "Subir" tab only and "JPG o PNG, hasta 4 MB. Se ve mejor a 1200 px de ancho."; a JPG and a PNG upload, and show in the editor, the "Detalle" and "Correo" previews, the detail page and "Historial · Ver";
    - a WebP is refused: "Subí una imagen JPG o PNG.";
    - text pasted from another site with its image saves as a draft, and the composer flags the image: "Esta imagen no está subida a Glitter: subila de nuevo."; sending refuses it with the same sentence;
    - with 6 images "Imagen" is disabled, and a 7th pasted in is refused when the draft saves: "Un comunicado puede tener hasta 6 imágenes.";
    - the email shows the image at the text's width in Gmail (web and phone) and in Outlook (desktop and web).

The large-audience paths (2,000 recipients, held batches, expiry, 429s, quota, config stalls) are covered by integration tests: staging narrowing keeps preview audiences small.

### I4. Observability

**Log lines** carry ids and counts only, never addresses or provider messages (`deliveries.ts:225-226`):

- `[comunicados] send {comunicadoId, eligible, skipped, narrowed}`, with `trigger: "schedule"` when a release started it
- `[comunicados] schedule {comunicadoId, eligible}`, `[comunicados] reschedule {comunicadoId}`, `[comunicados] schedule cancelled {comunicadoId}`
- `[comunicados] release missed {comunicadoId, reason}`: back to draft, with the bell item (E4)
- `[comunicados] release failed {comunicadoId, errorType, code}`: still scheduled, tried again next tick until it is late (E4)
- `[comunicados] retry {comunicadoId, campaignId, emails, people}`
- `[comunicados] edit {comunicadoId, revision, items}`
- `[comunicados] chunk {campaignId, notified, skipped, ms}`
- `[comunicados] batch {campaignId, size, outcome, attempt, ms}`
- `[comunicados] tick {trigger, released, missed, chunks, pushes, batches, expired, throttles, ms}`
- `[comunicados] Resend quota exceeded`
- `[notifications] throttled {deliveryId | jobId, retryAfterMs}`, logged by the wrapper's retry and the worker

**SQL runbook** (read-only; per AGENTS.md, state the resolved database target first):

```sql
-- 1. Backlog by lane
SELECT lane, channel, status, count(*), min(created_at) FROM notification_deliveries
WHERE status IN ('pending','processing') GROUP BY 1,2,3 ORDER BY 1,2,3;
-- 2. Transactional email delay, last day (comunicado email never queues ahead of it, and a throttle costs at most a 2 s retry: expect p95 in seconds)
SELECT percentile_cont(ARRAY[0.5,0.95,0.99]) WITHIN GROUP (ORDER BY extract(epoch FROM sent_at - created_at))
FROM notification_deliveries WHERE lane='transactional' AND channel='email' AND status='sent'
  AND created_at > now() - interval '1 day';
SELECT 'reservation' AS outbox, percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - created_at)),
       avg((attempts > 0)::int) AS retried_share
FROM reservation_notification_jobs WHERE status='completed' AND created_at > now() - interval '1 day'
UNION ALL
SELECT 'disciplinary', percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - created_at)),
       avg((attempts > 0)::int)
FROM disciplinary_notification_jobs WHERE status='completed' AND created_at > now() - interval '1 day';
-- 3. One comunicado
SELECT r.status, r.skipped_reason, count(*) FROM notification_campaign_recipients r WHERE r.campaign_id=$1 GROUP BY 1,2;
SELECT d.channel, d.status, d.last_error, d.content_revision, (d.maybe_sent_at IS NOT NULL) AS maybe_sent, count(*)
FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.campaign_id=$1 GROUP BY 1,2,3,4,5;
-- 4. Held batches and stuck sends (retracted ones are completed by the sweep, V10)
SELECT batch_key, count(*), max(attempts), min(created_at), bool_or(maybe_sent_at IS NOT NULL) FROM notification_deliveries
WHERE batch_key IS NOT NULL AND status IN ('pending','processing') GROUP BY 1;
SELECT k.id, k.title, k.sent_at FROM comunicados k JOIN notification_campaigns c ON c.id=k.campaign_id
WHERE c.status='processing' AND k.sent_at < now() - interval '30 minutes';
-- 5. Schedules due or missed
SELECT id, title, scheduled_at, schedule_missed_at, schedule_missed_reason, schedule_missed_detail FROM comunicados
WHERE (status='scheduled' AND scheduled_at < now()) OR schedule_missed_at IS NOT NULL;
-- 6. Every essential send (who, when, why)
SELECT k.id, k.title, k.essential_reason, u.email AS confirmed_by, k.essential_confirmed_at, k.sent_at,
       k.audience->'festivals' AS festival, k.audience_summary->'essentialOverride' AS reached_opted_out,
       k.audience_summary->'essentialNotOverridden' AS not_reached
FROM comunicados k JOIN users u ON u.id=k.essential_confirmed_by_user_id
WHERE k.essential AND k.status='sent' ORDER BY k.sent_at DESC;
-- 7. Throttles and quota still unresolved
SELECT date_trunc('hour', updated_at), last_error, count(*) FROM notification_deliveries
WHERE status IN ('pending','failed') AND (last_error LIKE 'resend:rate_limit%' OR last_error LIKE 'resend:%quota%')
GROUP BY 1,2 ORDER BY 1 DESC LIMIT 48;
-- 8. Bounces and complaints from one comunicado (the I2 gate)
SELECT s.reason, count(*) FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id
JOIN email_suppressions s ON s.email_key = lower(trim(d.recipient_email)) AND s.resend_email_id = d.provider_message_id
WHERE n.campaign_id=$1 AND d.channel='email' GROUP BY 1;
```

**Operator levers, in order of preference:**

1. "Retirar" on the comunicado (F3), or "Cancelar programación".
2. **Hold the whole bulk lane** (an emergency):
   ```sql
   UPDATE notification_deliveries SET next_attempt_at = now() + interval '1 day'
   WHERE lane = 'bulk' AND channel = 'email'
     AND (status = 'pending' OR (status = 'processing' AND lease_expires_at < now()));
   ```
   - Re-run it once the fan-out has finished, since later rows are written due.
   - Release it with `next_attempt_at = now()`.
   - A hold past the 20 h expiry fails the held emails safely (D3, Step 0). Rows that no attempt may have reached (`pending`, no `maybe_sent_at`) read "Venció sin enviarse" and can be retried. Rows with `maybe_sent_at`, or still `processing` from an attempt that never settled, read "Puede haber llegado". No key is ever re-submitted late.
   - To stop one comunicado, retract it instead.
3. **Hide the flag.** That only removes the admin UI.
4. **Recall an image posted by mistake** (PR 8). This is the best there is, not a full recall:
   - First edit the comunicado without it (F1). That takes it out of the inbox, and out of the emails not sent yet, which render the current revision. Retracting it (lever 1) takes the whole item out instead.
   - Then delete the file in UploadThing. Its key is the `…/f/<key>` of the image URL in the revision's `doc`, read with `getUploadThingFileKey`.
   - From then on, a sent email that loads it again shows a broken image. A copy already fetched is out of reach: Apple Mail Privacy Protection downloads images when the mail arrives, Gmail's image proxy caches them, desktop clients keep the images they showed, and a forward may carry one.
   - Earlier revisions show it broken in "Historial · Ver". "Duplicar" after a retraction copies the dead address, and the send check reads only its shape (`isUploadThingFileUrl`), so take the image out of the copy before sending it.

### I5. Rollback rules

- **Flag to hidden:** always safe for the data. Sends already confirmed keep going. Use lever 1 before hiding it (or target yourself on the flag again), or lever 2.
- **Migrations 0301–0303 are never reverted** (fixed forward, PRD §8).
  - Enum labels cannot be removed.
  - Old code tolerates rows carrying them, because every gift query filters `type = 'credit_gift'`.
- **Never revert the lane filters (PR 2) while bulk rows exist.**
  - Old drains would pull bulk rows into the first-in-first-out queue. They would fail email as `render_unavailable` (no `comunicado` email in the old registry), and send bulk pushes ahead of transactional ones.
  - If a revert is unavoidable, first run:
    ```sql
    UPDATE notification_deliveries SET status='skipped', last_error='rollback'
    WHERE lane='bulk' AND status IN ('pending','processing');
    ```
- **Retracted items stay hidden under old code,** because they are archived. An old archive toast's "Deshacer" hits the CHECK and errors, instead of bringing one back. This is why retraction uses `archived_at`.
- **Old inbox code** shows a `comunicado` row as a plain item from its stored title and body (an unknown kind gives `opensDetail` false).
- **A full revert past phase 3** leaves the old registry without `comunicado`, so `notificationOpensDetail` is false (`registry.ts:227-228`). A pending comunicado push would then show the body's first paragraph on the lock screen instead of "Tocá para ver el detalle." (`push/payload.ts:90-92`). The skip statement above covers it, so run it before such a revert.
- **The wrapper's 429 retry and the migrate lock timeout can be reverted on their own.** Neither writes data.
- **Never rotate `CLERK_SECRET_KEY` casually:** it breaks every unsubscribe link already sent. This is unchanged.
- **The P2b rule stands:** never revert code past 0300 (PRD §10, P2b).

---

## J. PR plan

Eight PRs. Groundwork ships first and alone, because it changes the transactional hot path and should soak (I2).

**How they shipped:** PRs 2 and 3 merged on their own (#603, #604). PRs 4–8 shipped together in one pull request (#605), each PR's commits in order on one branch; the cuts below still describe what each one adds. None of PRs 5–8 needed a migration. What the code settled differently from this design is in the implementation notes at the end of this section.

**Why the cuts fall where they do:**

- Writing is split from sending: the renderers are the XSS and email-client risk.
- Retraction ships with the send button, so there is never a send without a stop.
- Images are the last, optional PR (K11).
- Each schema PR carries one migration. Every comunicado column, schedule and retraction included, is in 0303, so the CHECKs exist from the first row.

**Every new integration file is added by hand** to `package.json:29` `test:integration`, in the **second, serial** invocation (`vitest.reservations.integration.config.mts`, `fileParallelism: false`, `testTimeout: 15_000`, next to `push-deliveries.integration.test.ts`).

- Each one asserts membership of its own fixture ids, never totals over the shared database.
- Timing constants (spacing, poll, expiry) are injectable, so no test waits on real time. Long cases set their own timeout.

### PR 1: PRD design

§12 of `docs/PRD-in-app-notifications.md` and this document.

**Migration:** none.

### PR 2: Sending groundwork (no producer, no UI)

**Scope:**

- The lane, `batch_key`, `maybe_sent_at` and `content_revision` columns, with their CHECKs and indexes.
- Lane filters in `processPendingNotificationDeliveries` and `sendDuePushDeliveries`; the bulk-email guard in `claimDelivery`.
- The wrapper's one 429 retry in `sendEmail`/`sendBatchEmails`; `EmailSendError.retryAfterMs`; the worker's no-spend throttle rule with database-clock `next_attempt_at`.
- `SendBatchOptions.batchValidation`.
- `app/lib/notifications/bulk-email.ts`: expiry, claim with `maybe_sent_at`, try-lock and reserve, spacing under the lock, pre-check and render hooks through the renderer registry, the outcome table with key dropping, settle, release.
- `sendBulkPushes`, with the VAPID guard.
- The `announcements` topic and both labels (not the card copy). `comunicadoEmailExclusion` and `announcementOptOutOverridden`. `EmailFooter({ notes })`. `publicBaseUrl()`, with `unsubscribeLinks` on it.
- `notifications.edited_at`, `retracted_at` and the CHECK; `updateOne`, `markNotificationRead` and `markNotificationsUnreadAction` exclude retracted rows; the push skip `retracted`.
- `scripts/migrate.ts` `lock_timeout`.

**Migration:** `0301_bulk_lane`.

**Tests:**

- **Unit:** `drizzle/enum-labels.test.ts` (A0); `app/vendors/resend.test.ts` (the `batchValidation` option, scoped key, one 429 retry honouring Retry-After capped at 2 s, no retry on other codes); `bulk-email.test.ts` (the outcome table, key dropping only without `maybe_sent_at`, the permissive index mapping and the mismatch fallback, the reserve arithmetic); `unsubscribe-footer.test.tsx` (note lines); `urls.test.ts`; topic labels.
- **Integration** `app/lib/notifications/bulk-email.integration.test.ts` (serial), with a fixture renderer:
  - the transactional drains never claim a bulk row, and `attemptNotificationDelivery` refuses a bulk email;
  - a fresh claim takes ≤ 100 rows of one campaign and commits the key before the mocked call;
  - a held batch is re-claimed whole under the same key and never gains rows;
  - a crashed attempt (rows left `processing`) is marked `maybe_sent_at` on re-claim;
  - unknown → same key, attempt spent; 409 → `sent` `idempotent_replay`; 200 after an unknown → `content_revision` = rendered;
  - a refusal without `maybe_sent_at` drops the key; with it, keeps it;
  - quota fails the campaign's never-batched rows and stops; config stops and spends nothing;
  - rows older than 20 h are never sent (`expired` / `outcome_unknown`); a stale `processing` row past 20 h ends `outcome_unknown` with `maybe_sent_at` set and cannot be retried;
  - a renderer that throws for one campaign spends attempts with backoff and does not block another campaign's batch;
  - a permissive per-item error fails only that row;
  - two drivers: one request at a time, ≥ spacing apart; the try-lock never blocks; the reserve releases a claim untouched;
  - a retracted row cannot be un-archived, `updateOne`, `markNotificationRead` and `markNotificationsUnreadAction` are no-ops; push skips `retracted`.
- **Changed:** `gifts.integration.test.ts:651-656` (a 429 no longer spends an attempt).

### PR 3: Distribution lists and the gift picker

**Scope:**

- The `comunicados` flag and its doc row.
- `app/lib/participants/recipient-eligibility.ts` (gifts switch to it, same behaviour).
- `app/lib/distribution_lists/{definitions,resolve,queries,actions}.ts`, with the departamento attribute.
- The Comunicaciones layout and rail (Listas and the gifts link), and the nav entry.
- List pages, including the Confirmados page (G8).
- "Agregar una lista" in `CreditGiftRecipientPicker`, with `expandListForCreditGiftAction`.

**Migration:** `0302_distribution_lists`.

**Tests:**

- **Unit:** `distribution_lists/definitions.test.ts` (strict v1 schema, defaults, `new_artist` expansion, `STATE_VALUES`, an unreadable filter fails); `app/components/navbar/communications-navigation.test.tsx` (admin with the flag yes; festival admin and admin without the flag no; desktop and mobile; the pattern of `blocked-emails-navigation.test.tsx:67-89`); picker test (refused over 100, dedupe, skip reasons, disabled outside production).
- **Integration** `app/lib/distribution_lists/lists.integration.test.ts` (serial): Confirmados = owners ∪ partners of `accepted` only (not `pending`, `verification_payment`, `released`); one row for a person on two reservations; past festivals; pre-reveal included; each filter attribute with AND/OR; filter lists exclude roles other than `user`; fixed members cascade on user delete; archive frees the name; gift expansion classifies like `classifyCreditGiftRecipients`; the lists-page counts equal the resolver's; every action refuses a festival admin.

### PR 4: Writing comunicados (nothing can send to recipients)

**Scope:**

- The `announcement` variant without images (schema, tags, toolbar).
- `normalizeAnnouncementDoc` with stages. `announcementBlocksToText`, `announcementBlocksToEmail` and `app/emails/comunicado.tsx`, with the staging and essential note slots. `excerptOf`.
- Kinds `comunicado` (`push: "per_send"`) and `comunicado_not_sent`; the `notificationPushes` option and `notify({ push })`.
- `safeActionPath` with the whitespace rule.
- The gift report's `status` narrowed to its literal union (`credit_gifts/queries.ts:377`), which 0303's `notified` label requires (A6).
- The `comunicados` CRUD: create, autosave CAS, discard. The composer with preview tabs and live audience counts (read-only resolver).
- Test send. The Comunicados list (drafts).

**Migration:** `0303_comunicados`.

**Tests:**

- **Unit:**
  - `comunicados/content.test.ts`: refuses unknown types, h1/h4, depth 3, `javascript:`/`data:`/`//`; strips colours, underline, strike, alignment; size limits; draft vs send stage;
  - `app/emails/comunicado.test.tsx`: absolute URLs by concatenation, inline styles, no `details`/`input`/`figure`/`pre`, the greeting through `safeGreetingName`, essential and staging notes, the `[Prev]` subject;
  - `comunicados/text.test.ts`;
  - the announcement sanitizer's XSS cases (as `rich-text.test.ts:100-177`);
  - `definitions.test.ts`: `safeActionPath` refuses `/\t/x`, `/\n/x`, `/ x`;
  - `registry.test.ts`: fixtures, per-send push, the rewritten "pushes participant news", two email kinds;
  - the test-send action: rate limit, "[Prueba]", no rows written.
- **Integration** `app/lib/comunicados/drafts.integration.test.ts` (serial): autosave refuses a stale version and a comunicado that is not a draft; autosave accepts a half-filled button and essential on a draft (CHECKs exempt drafts); a sent row with an unpaired button or an essential without a reason is refused by the CHECKs; discard deletes only drafts; the audience preview counts match B5 without inserting.

### PR 5: Sending, report v1, retraction, essential

**Scope:**

- `resolveComunicadoAudience` with the snapshot (`ORDER BY user_id`) and narrowing.
- `startComunicadoSend(tx, …)`: CAS, typed count, `AUDIENCE_CHANGED`, the caps, essential with a current festival, the base-URL check, one retry on 40P01/23503.
- `notifyMany`. Fan-out chunks with transient-error classification, poison isolation, and completion with a row lock and the sweep.
- The comunicado batch renderer and pre-check (D3): allowlist, `address_changed`, `overridden` without headers, staging marks.
- The environment filter for lane-wide runs (the comunicado renderer's `<scope>`, D9), and the chunk's source allowlist and row-7 re-check (D2 step 6).
- `runComunicadoWork`, the cron route `/api/cron/morning/comunicados` with its `vercel.json` entry, the `after()` driver, and "Procesar envíos pendientes" (previews, single flight).
- The essential record: RESTRICT, and `hasRestrictActorReferences`. The H6 unsubscribe-card copy.
- Confirm dialog. Comunicado page with KPIs (including bounces), stall banners, the paged table and filters.
- `retractComunicado`, completing at the end.
- Rich detail body, `editedAt` in the DTO, the data-driven Anuncios chip.

**Migration:** none.

**Tests:**

- **Unit:** `app/api/cron/morning/comunicados/route.test.ts` (auth, the 75 s deadline, no batch with < 25 s left, the development email step refused); `notifications/definitions.test.ts` (the chip); `notification-detail` rich body and "Editado"; confirm dialog (typed at 300 and on essential, callouts by environment); `unsubscribe-card` copy per topic.
- **Integration** `app/lib/comunicados/send.integration.test.ts` (serial):
  - union and dedupe (person wins), every skip reason, the 3,000 cap counted before narrowing;
  - the pre-check fails closed for a row with no recipient row or a NULL source, and the chunk skips such a row too;
  - a lane-wide run leaves another environment's campaign untouched; a chunk under preview skips list members;
  - `VERCEL_ENV` mocked to preview and to development → list members skipped "Entorno de prueba: no se envía a listas", admins substituted with source `staging_admin` ("Admin de prueba"), people by name kept, a festival admin by name skipped, and the batch pre-check refuses a list member even if a row slipped through;
  - a double "Enviar" → one campaign; `AUDIENCE_CHANGED`;
  - essential only with one current festival source and email; it overrides `announcements` (no `List-Unsubscribe`) but never `all` or a suppression; an archived festival is refused; the confirmer's profile cannot be deleted;
  - a ban between snapshot and chunk → skipped; an address changed under a held batch → `address_changed`;
  - a profile deletion racing the snapshot and a chunk → no deadlock, a retry or a cascade;
  - a crash mid-chunk resumes without duplicates; a transient error spends no attempt;
  - 2,000 generated recipients fan out within one budgeted run (statement count asserted);
  - push rows only when ticked; completion CAS;
  - gift lists and the gift resume never see a comunicado.
- **Integration** `app/lib/comunicados/retract.integration.test.ts` (serial, two connections):
  - the retraction waits for a batch holding the shared lock;
  - afterwards hidden from list, count, detail and `/open`; unarchive, mark-read and mark-unread are no-ops;
  - pending email and push `skipped retracted`; pending recipients skipped; later chunks stop;
  - a claimed row skips in its pre-check, or is released as skipped;
  - the campaign ends `completed` (in the retraction, or by the sweep);
  - report counts are kept (V3, V4, V10).

### PR 6: Scheduling, retry, duplicate

**Scope:**

- Schedule, change-date and cancel actions (CAS).
- Release through `startComunicadoSend(tx, …)` under the row lock; the 60-minute limit; typed refusals recorded at the first failure with reason and detail, under a version CAS; the sender-is-admin check; the `comunicado_not_sent` item and who receives it.
- `ScheduleDialog` generalized (`onConfirm`, `STORE_TIMEZONE`). Overdue banners (every environment).
- "Reintentar fallidos" (reopen under the row lock, never `maybe_sent_at` rows, addresses in SQL). "Duplicar".

**Migration:** none.

**Tests:**

- **Unit:** La Paz parsing; schedule validation (5 min to 60 days); retry dialog counts; overdue banner predicate.
- **Integration** (serial), in five files under `app/lib/comunicados/`, so each covers one service: `schedule.integration.test.ts` (Programar, Cambiar fecha, Cancelar), `release.integration.test.ts` (the release, its misses and its races), `retry.integration.test.ts`, `duplicate.integration.test.ts`, and `queries.integration.test.ts` (the list row's version, who scheduled it, the copy's source title). Together they cover:
  - cancel ∥ release and "Enviar ahora" ∥ release each give exactly one outcome;
  - change of date refused once sent; a change of date committed after a failed release keeps the new date (miss CAS);
  - two lane runs release once;
  - late > 60 min, too large, empty, invalid (unreadable filter, ended essential festival) and sender-not-admin → draft with reason, detail and one bell item, at the first failure;
  - a missed draft sends with "Enviar ahora";
  - an unexpected error on one due schedule does not stop the next one in the same tick (E2);
  - a missed essential schedule clears `essential_confirmed_*`, and the draft can then untick essential (E4);
  - in development, "Programar" and "Cambiar fecha" are refused (E1);
  - the audience is computed at release; a scheduled row refuses an autosave;
  - retry reopens a completed campaign and a later tick completes it; two concurrent retries create one retry row per person; retry creates `:retry:` rows only for `failed` without `maybe_sent_at` and is refused when retracted;
  - duplicate copies title, text, button, email and audience, never push, essential or schedule.

### PR 7: Editing after send

`editSentComunicado`, the edit page and dialog (the note required on essential), "Editado" end to end, the revision history with "Ver" on each version, and the per-email version in the report. Launch docs: PRD status and launch checklist, flag doc, the I3 checklist.

**Migration:** none.

**Tests:**

- **Unit:** the edit action (actor first, the note stripped, trimmed and capped, codes passed through); the revision action; the dialog's lines (`edit-copy.test.ts`); the editor (the banner, saving disabled until a change, the essential note, "Recargar" on a stale edit); the edit page's redirects; "Historial" and "Ver"; the report's "Editar" and edited line.
- **Integration** `app/lib/comunicados/edit.integration.test.ts` (serial, two connections):
  - the edit waits for a batch holding the shared lock, and later batches render _n+1_ (V2);
  - a chunk that committed before the edit is rewritten with `edited_at`; one after it writes _n+1_ with no `edited_at` (V1);
  - `read_at` untouched; the detail page shows _n+1_'s HTML at once;
  - a held batch re-sent after the edit carries _n+1_; a mocked 409 records `idempotent_replay`, a mocked 200 records `content_revision` = _n+1_;
  - an email sent before the edit stays, and the report reads it as "versión 1";
  - a pending push carries the new title;
  - the `expectedRevision` CAS; the lock-timeout message; a second deadlock answers "probá de nuevo";
  - an edit after a retraction is refused, also one retracted while it waited for the lock; an essential edit without a note is refused; an edit that changes nothing anyone sees is refused;
  - a comunicado with an uploaded image edits like any other: the image reaches revision _n+1_, the detail page and the email, and an untouched document with an image is "no change"; a foreign image or a seventh one is refused, as at send;
  - the history lists both versions, with the note; the action refuses a festival admin, and anyone while the flag is off.
- **Integration** `app/lib/comunicados/revisions.integration.test.ts` (serial): the history's queries, in order and per comunicado, answer only global admins; "Ver"'s action reads one version as it was written.

### PR 8: Images (optional, K11)

**Scope:**

- The `comunicadoImage` route (JPEG/PNG, admin, flag).
- `image` in the variant, with the Upload-only file panel.
- The walker's and the sanitizer's image branch.
- The `isUploadThingFileUrl` host rule (`app/lib/uploadthing/file-key.ts`), flagged by the composer on a draft and refused at the send stage; the 6-image cap at both stages.
- The I4 lever documented.

**Migration:** none.

**Tests:**

- **Unit:** content refuses foreign hosts at the send stage and keeps them on a draft, and refuses 7 images; the email `Img` attributes; the upload middleware (role, flag, type).
- Also: the host rule (`file-key.test.ts`); counting and flagging images at any depth (`images.test.ts`); the sanitizer keeps an uploaded image and its caption and drops any other (`rich-text.test.ts`); the inbox styles (`rich-text-html.test.tsx`); "Imagen" in the toolbar, off at six images; the upload panel and the file checks; the flag in "Mensaje".

### Implementation notes (PRs 6–8)

What the code does where this design left a detail open or said something else. Where a section above would mislead, it was corrected in place too (E2, E4, G1, C2, C3); the rest still reads as designed and is amended here.

**Times (E5, E6, F2, G6, G9, H2).** Every time is written in La Paz, the way the rest of the dashboard writes it (`formatDisplayDate`), not as "sáb 31 oct, 09:00":

- "sáb, 31 oct, 9:00 AM" on the badge, the overdue banner, the bell item, the header's "Enviado el …" and "Editado el …", and "Historial": "Versión 2 · editada por Ana el dom, 25 oct, 10:12 AM · «Cambió el horario de armado»";
- "Programado para el sábado, 31 de octubre, 9:00 AM (hora de Bolivia)" on a scheduled comunicado's page;
- "Editado el 25 de octubre, 10:12 AM" on the participant's detail page.

**Scheduling (E1–E6):**

- **The picker** opens at the next full hour plus one, in La Paz: at 10:12 or at 10:00 it offers 12:00.
- **Bounds and clocks.** A schedule may be from now + 5 minutes to now + 60 days, both included, on the server's clock. At release, "late" is strictly more than 60 minutes after `scheduled_at` on the database's clock, and it is checked before whether the scheduler is still an admin. "Overdue" is 3 minutes or more past `scheduled_at`, on the clock of the server rendering the page. A scheduled comunicado's page refreshes itself from its time on (on the browser's clock), as it does once overdue, so a page left open turns into the report when the release comes, or shows the overdue banner when it does not.
- **A scheduled comunicado** opens a read-only page of its own (G1), not the composer: the frozen banner, "Programado para el … (hora de Bolivia) · lo programó Ana", the overdue banner when it applies, "Enviar ahora" · "Cambiar fecha" · "Cancelar programación" · "Duplicar", "Destinatarios" and "Canales" as cards, and the message's preview. Nothing can autosave there, so nothing races the release.
- **Development.** "Programar…" is disabled, with E1's sentence under it, and the dialog and the server refuse as well. "Cancelar programación" works, since it is a stop.
- **Losing races, in words.** "Cancelar programación" on a row that is already a draft (cancelled in another tab, or missed) succeeds with "Ya no estaba programado: es un borrador." "Cambiar fecha" on a draft answers "Ya no está programado: volvió a ser un borrador." A change of date keeps whoever scheduled it as the sender.
- **The release** sends as `scheduled_by_user_id` (E2). It never runs in development. A refusal that is not a miss (`NOT_FOUND`, `STALE`, `AUDIENCE_CHANGED`) is handled as an unexpected error: the comunicado stays scheduled until it is late.
- **The miss** stores the bell's whole sentence in `schedule_missed_detail`, so the draft's banner and the bell say the same; the bell item's `data.detail` keeps only the clause G9 splices in.
- **Overdue actions.** The list row offers "Enviar ahora" only: on previews the list page already has "Procesar envíos pendientes" at the top. The comunicado's page offers both on previews (E6).

**Retry and duplicate (G6):**

- **N** in "Reintentar fallidos (N)" is the emails a retry sends again (the latest email delivery `failed`, with no `maybe_sent_at`) plus the recipients the fan-out failed for. With nothing to retry the action refuses, "No hay nada para reintentar.", and the campaign stays as it is.
- **Only the environment that sent it retries it.** The work after the retry drains the campaign with this server's narrowing, and development only simulates, so another environment's comunicado is refused ("Este comunicado se envió desde otro entorno: reintentalo desde allí.") and its page offers no button.
- **Locks and limits.** The retry waits at most 20 s for its locks, then answers "No pudimos reintentarlo ahora. Probá de nuevo en unos segundos." Its limit is once per 5 minutes per comunicado, across admins; an attempt that rolled back (a lock timeout, an error) gives its turn back. Its `after()` work runs as the `send` trigger.
- **"Duplicar"** works from any status. A sent comunicado is copied from its current revision, since an edit leaves the working copy's text and button behind; any other from its working copy. The title is kept as it is, with no "Copia de" prefix. The copy opens at `/dashboard/communications/{newId}?copia={sourceId}`, and the page reads the source's title for the banner: no column marks a copy.

**Editing (F1, G6, G7):**

- **An edit that changes nothing anyone sees** (the rendered HTML, the plain text, the title and the button all equal the current revision's) is refused, "No cambiaste nada: el comunicado sigue igual.", so no item is marked "Editado" for nothing. The text is compared because the inbox HTML lays a nested block flat while the email and its text part indent it: an edit that only nests or un-nests a block is accepted, and marks the items "Editado" though their detail page looks the same.
- **`edited_at`** is the new revision's `created_at`, which is `clock_timestamp()` after the wait for the lock, not `now()` (F1 step 5): the inbox, the detail page and "Historial" show the same time.
- **The working copy** gets only the new title, `current_revision`, `version` and `updated_*` (F1 step 4); its `doc` and button stay as sent. Everything that shows a sent comunicado, "Duplicar" included, reads its revision.
- **Two deadlocks** in a row answer "No pudimos guardar los cambios. Probá de nuevo."; the note may be up to 300 characters ("La nota puede tener hasta 300 caracteres.").
- **The note's label** on an essential comunicado is "Nota del cambio (obligatoria en un correo esencial, solo para el equipo)"; otherwise G7's.
- **"Ver"** in "Historial" reads that version through a server action when it is opened, and shows its stored HTML and button in a dialog.

**Images (C1–C4, PR 8):**

- **Email width.** An image is 430 px wide, not 552: the comunicado's container is 480 px with 24 px of padding (`app/emails/styles.ts`). It carries `width="430"` for Outlook, and `max-width: 430px; width: 100%; height: auto` for the rest.
- **Captions.** An image's `name` is its caption, so the inbox's `alt` equals the email's. There is no caption field: a caption survives only from a paste.
- **Rules at both stages.** More than 6 images is refused: "Un comunicado puede tener hasta 6 imágenes." An image with no URL is dropped silently, with what was nested under it lifted into its place. The send stage alone refuses a foreign image (C2 step 5).
- **The text rule is unchanged.** A comunicado of images only is refused at send: "Escribí el texto del comunicado."
- **Foreign images** are flagged on the draft by the editor, with the same host rule the server uses: autosave carries no flag. The sanitizer and the email walker also drop any image that fails the rule.
- **No lazy loading** in the inbox or the email.

**Tests.** PR 6's integration tests are five files, not one (PR 6 above).

---

## K. Open questions for Dennis, and risks

### The Resend plan (decision 9, answered by Dennis on 2026-10-24)

- **Plan:** Pro, 50,000 emails a month, with no daily limit. The allowance is shared by every Glitter email (reservations, gifts, tickets, orders, invitations), so running it out stops those too.
- **What it allows:** a 2,000-person comunicado is 4 % of the month, so about 20 full-size sends a month fit alongside the rest.
- **The monthly cap still applies.** A `monthly_quota_exceeded` error stops the email step lane-wide for the run, and fails the batch and the campaign's never-batched emails without retrying them (D3). The page shows the quota banner, and "Reintentar fallidos" sends them once the allowance renews (G6).
- **Rate limit:** Resend's docs (checked 2026-10-24) give a default of 10 requests per second per team, across all API keys; older Resend pages said 2 or 5. The account's actual value is on Resend → Settings → Usage. Bulk is paced to at most about 0.43 requests per second (D3, D4), which stays safe even at 2 per second.
- **Residual to accept:** the wrapper retries a throttle once. An inline sender (orders, tickets, profile and program mail) that is throttled twice within about 2 s still loses its email, as it can today, until P4 moves those senders onto the queue.

### K1–K16. Open questions (each his call; the default in brackets)

Each is a proposed default of PRD §12; its title gives the default's number there.

1. **`{nombre}` in comunicados (PRD §12 default 17).** [No in phase 3. The email greets the person by name automatically. Adding it later costs a name snapshot per recipient and a per-row UPDATE on edit.]
2. **Essential and the `all` unsubscribe (PRD §12 default 10).** [Essential overrides only the Anuncios opt-out. People who asked support to stop all bulk mail keep that, and still see the comunicado in the app. Changing it is one line.]
3. **Sender and replies (PRD §12 default 19).** [From "Productora Glitter <anuncios@productoraglitter.com>", Reply-To `soporte@productoraglitter.com`.] Alternatives: `eventos@`, which participant invitations already use (`invitations.ts:54`), or no replies at all.
4. **A subdomain for anuncios (PRD §12 default 19).** [No: the same domain as K3.] A subdomain such as `anuncios.productoraglitter.com` needs DNS records in Resend, and keeps bulk reputation away from reservation mail.
5. **Late schedules (PRD §12 default 16).** [A scheduled comunicado more than 60 minutes late goes back to draft, with a bell item, instead of sending.]
6. **Thresholds (PRD §12 default 15).** [At most 3,000 recipients per comunicado. Type the count at ≥ 300 recipients and for every essential send.]
7. **Edits and read state (PRD §12 default 18).** [An edit keeps read state and does not re-alert. For a material change, send a new comunicado.]
8. **Essential only for a current or upcoming festival (PRD §12 default 11).** [The festival is not archived and ended at most 7 days ago.] This narrows decision 5 to its own example, a setup-time change.
9. **Narrowing in development too (PRD §12 default 13).** [Yes.] Decision 8 names previews. A local server with an unset `VERCEL_ENV` counts as development and may point at a shared or production database, where list sends would write real inbox rows and could push. Scheduling is refused there (E1): no cron runs in development, and that database's own cron would release the schedule unnarrowed.
10. **Filter attributes for saved lists (PRD §12 default 20).** [Área, Categorías, Departamento, confirmed or not at given festivals, and "Incluir pausados".] Anything else (tags, gender, participation type, complete profile, sanctions) is one field each.
11. **Images in comunicados (PRD §12 default 21).** [Yes, as PR 8, after the text-only flow ships.] They cost an upload route, a host rule, the size check and an image that cannot be recalled after sending, except by deleting the file.
12. **Festival admins and Comunicaciones (PRD §12 default 14).** [No access in phase 3, viewing included.] Gifts let them view with the button disabled (PRD §4, decision 1). Read-only access later is small.
13. **Admins picked by name (PRD §12 default 12).** [People picked by name may include global admins; lists only ever hold participants.] An admin can then run a real comunicado through the whole production pipeline to themselves, or to "Ana y yo", before a large send. It matches the preview rule, where admins are the substitutes anyway, and lists stay participant-only, so they mean the same in the gift picker (B5).
14. **Scheduled sends are not re-confirmed (PRD §12 default 22).** [A scheduled send goes to whoever the lists hold at release, up to the 3,000 cap (E3).] Alternative: refuse at release when the audience grew by more than 10 % since it was scheduled, which needs the count stored at scheduling.
15. **Anuncios is its own opt-out (PRD §12 default 23).** [Someone who opted out of the participant-invitations topic ("Avisos a participantes", `app/lib/emails/topics.ts:30`) still gets comunicado email; `all` covers both.] Alternative: Anuncios also honours that opt-out.
16. **Lists in the gift picker (PRD §12 default 24).** [Production only, and the 100-recipient gift cap stays, so a festival's Confirmados, usually over 100, is refused (B9).] Alternative: raise the gift cap (PRD §4 decision 2).

### Facts to check (not calls)

- How many verified and paused participants there are today, read-only, after stating the database target (AGENTS.md). A "Todos los participantes" list may already be over 3,000.
- Whether the shared staging database holds real participants' addresses. People picked by name on a preview get real email (decision 8): the dialog names them, the picker tags them, and the mail is marked as a test.
- The account's rate limit (Resend → Settings → Usage), and Resend's account-level bounce and complaint thresholds. The thresholds set the I2 gate.

### Risks

| Risk                                                                                                                                                                                  | Mitigation                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A release bundles 0301–0303 in one transaction, and a later migration uses an `ADD VALUE` label: the production deploy fails, though every preview passed.                            | The A0 rule; `drizzle/enum-labels.test.ts`; a reviewer checklist item.                                                                                                                                                                                                 |
| A batch holds one pooled connection, the comunicado lock and `ACCESS SHARE` locks across the Resend call (≤ about 15 s); edits wait that long, and a migration could queue behind it. | Single flight, so at most one such connection; a try-lock, so nothing waits on the lane; `lock_timeout` turns the worst case into "Probá de nuevo"; the migrate `lock_timeout` (A0); precedent and bound in `db/index.ts:130-143`.                                     |
| Resend's rate limit is shared with senders we don't pace: the outboxes' parallel `after()`, `queueEmails` at about 10 per second, festival invitations.                               | Bulk at ≤ about 0.43 requests per second, single flight; every sender retries a throttle once in the wrapper; the residual accepted with the Resend plan (K).                                                                                                          |
| Account-wide quota exhaustion: 50,000 emails a month, shared by every Glitter email (decision 9).                                                                                     | Bulk stops at the first quota error and fails the rest without retrying; the banner and "Reintentar fallidos".                                                                                                                                                         |
| Permissive batch responses mapped to the wrong rows.                                                                                                                                  | A recorded-response test; the count-mismatch fallback (ids null, rows sent); one preview check with a bad address.                                                                                                                                                     |
| A held batch that may have landed is never confirmed.                                                                                                                                 | It is re-sent only under its own key, until 5 unknown outcomes or 20 h; it is never re-batched under a new key or retried by hand, and reads "Puede haber llegado" unless it ends `sent`.                                                                              |
| Sent emails and delivered pushes cannot be recalled after an edit or a retraction.                                                                                                    | The dialogs say so; push text is only the title plus "Tocá para ver el detalle."; a tap always lands on the current item or the inbox; the iPhone arrival toast may show an old title once.                                                                            |
| Previews share one database and send real email; one preview's "Procesar envíos pendientes" drains another branch's rows with its own code.                                           | Narrowing at the snapshot and again at send, by the sender's env, as an allowlist; the button only on previews and single flight; every step idempotent and compare-and-set; staging mail is marked.                                                                   |
| Deadlocks between a retraction or a chunk and a simultaneous profile deletion.                                                                                                        | Postgres aborts one side; transient errors are retried once and spend no attempt; the deletion cron retries on its next run.                                                                                                                                           |
| Deliverability: 2,000 emails from a mostly transactional domain; stale addresses in past festivals' lists; a complaint suppresses the address for all mail, reservations included.    | One-click unsubscribe; essential limited to a current festival's Confirmados, honouring `all`, with a recorded reason and no one-click header for the overridden; the bounce KPI and the I2 gate; check SPF, DKIM and DMARC alignment in Resend before step 4.3 of I2. |
| Comunicado images in UploadThing are never cleaned up (PR 8).                                                                                                                         | Accepted, so sent emails keep their images. A later cleanup must spare them (a PR 8 review item). Recalling one is the manual lever in I4.                                                                                                                             |
| Render cost at 2,000.                                                                                                                                                                 | Measured in PR 5; the render-once-and-substitute fallback is documented (D10).                                                                                                                                                                                         |
| Report weight at 3,000 recipients.                                                                                                                                                    | Server paging; one aggregate query on existing indexes; revisit before raising the cap.                                                                                                                                                                                |
