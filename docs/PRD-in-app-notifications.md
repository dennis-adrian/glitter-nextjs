# PRD: In-app notifications and credit gifts

**Product:** Glitter
**Feature area:** Participant inbox, admin communications, credits
**Status:** Phase 1 merged to develop; phase 2 in review (§11)
**Last updated:** 2026-10-21

---

## 1. Summary

Every email Glitter sends a participant should also reach them inside the app, in one inbox that keeps what they were told. Admins get tools to write to participants, starting with the most concrete one: gifting credits to several people at once with a personal message.

The study behind this PRD (4 October 2026) compared vendors (Novu, Knock, SuprSend, Courier, MagicBell) and recommended building in-house on the Postgres outbox the reservation and disciplinary emails already use, with Resend as the email pipe. None of the vendors ships voseo, the free tiers keep little history, and the hard parts (audiences, the ledger transaction, the admin console) stay ours either way.

Credit gifts ship first because they exercise the whole pipeline (business change, in-app row, email delivery, retries, admin report) without touching any email that works today.

---

## 2. Goals

- One inbox per user, with a bell in the navbar: a popover on desktop, a full page on phones.
- A single `notify(tx, …)` call that writes the in-app row and its email delivery in the same transaction as the business change.
- Email deliveries that are durable, retried, deduplicated and visible to admins.
- Admins can gift credits to up to 100 participants with a personal message, see who got it and who read it, re-deliver the notice, and revoke it.
- The participant sees the gift three ways: an inbox item, an email, and a wallet row with the full message.

## 3. Non-goals (phase 1)

- Mirroring the existing reservation, payment, discipline and enrollment emails in the inbox (phase 2).
- Admin-written announcements (comunicados), rich text, scheduling (phase 3).
- Notification preferences and email opt-outs (phase 3 for announcements, phase 5 for the rest).
- Push notifications to the device's own notification center (phase 2b).
- Editable email copy (phase 6).
- Backfilling past emails into the inbox.

---

## 4. Decisions

Agreed with Dennis on 2026-10-18. Numbers 3, 4 and 7 had no recommendation of their own; the values below are the defaults chosen for phase 1, each a single constant in code.

| #   | Decision                     | Phase 1 rule                                                                                                                                                                                                  |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Who can gift                 | Global admins only. Festival admins see the gifts and the "Regalar créditos" button disabled, with the reason.                                                                                                |
| 2   | Recipients per gift          | At most 100.                                                                                                                                                                                                  |
| 3   | Credits per person per gift  | At most 500 (Bs 500), to catch a typo like 200 for 20. `CREDIT_GIFT_MAX_AMOUNT_PER_RECIPIENT`.                                                                                                                |
| 4   | Extra confirmation           | When the total is 1.000 credits or more, the admin types the total before confirming. Below it, a normal confirm dialog. `CREDIT_GIFT_TYPE_TO_CONFIRM_TOTAL`.                                                 |
| 5   | Revoking a partly spent gift | Allowed. The dialog warns how many recipients would end with a negative balance, which blocks credit use until regularized.                                                                                   |
| 6   | Expiry                       | None. Gifted credits behave like any other credits.                                                                                                                                                           |
| 7   | Finanzas                     | Gifts post `admin_grant` entries tagged with the gift, so Finanzas can count them as a cost and never as income. Today it counts neither way; see §9.                                                         |
| 8   | Message                      | Plain text: a title up to 60 characters and a message up to 300, with `{nombre}` filled in per recipient. Occasion presets: Agradecimiento, Compensación, Premio, Bienvenida, Otro. A required internal note. |
| 9   | Sender shown                 | "Productora Glitter". The admin's name stays in the audit trail and the admin pages only.                                                                                                                     |
| 10  | Celebration                  | A calm one-time banner on the participant's next visit, combining every gift not yet shown into one.                                                                                                          |
| 11  | Admin emails in the bell     | Category "Administración", visible to the admin role only. Phase 1 posts one admin item: the summary of a gift the admin sent.                                                                                |
| 12  | Retention                    | Items older than 180 days leave the inbox. Nothing is deleted.                                                                                                                                                |
| 13  | Past history                 | No backfill. The inbox starts empty.                                                                                                                                                                          |
| 14  | Rollout                      | Feature flag `notifications`, default "Solo administración". Participants get the bell once phase 2 mirrors the queued emails. Notifications are written for everyone from day one.                           |
| 15  | Opt-outs                     | None in phase 1. Every phase 1 notification is transactional: in-app and email always on.                                                                                                                     |

---

## 5. Who receives a gift

A recipient must be a participant who can open their wallet:

- role `user`;
- status `verified` or `paused` (the statuses `/my_credits` lets in);
- no pending profile deletion.

Anyone else that the admin added is kept on the gift as **omitido**, with the reason: "Perfil no verificado", "Cuenta suspendida", "Cuenta en eliminación" or "No es participante". Eligibility is checked again inside each recipient's transaction, so a profile deleted or banned between confirming and processing is skipped, not credited.

Gifting requires the `credits` flag to be public for participants. While it isn't, the composer is disabled and says why: every email would otherwise link to a wallet the participant cannot open.

---

## 6. Admin flow

Lives under **Créditos → Regalos** (`/dashboard/credits/gifts`), next to the balances and movements it changes. Phase 3's Comunicaciones area will link here.

1. **Recipients.** Search participants by name or email and add them one by one, up to 100. People who cannot receive a gift appear in the results disabled, with the reason.
2. **Amount per person.** Presets 5, 10, 20, 50 or any amount with up to two decimals, at most 500.
3. **Occasion.** Picking one fills an editable title and message.
4. **Message.** Title (≤ 60) and message (≤ 300), with a button that inserts `{nombre}`. Internal note (required, ≤ 500), never shown to participants.
5. **Preview.** The inbox item, the email and the wallet row, rendered for the first eligible recipient.
6. **Confirm.** A dialog restates recipients, omitted people, credits per person and total. At 1.000 credits or more the admin types the total.
7. **Result.** The admin lands on the gift's page while recipients are processed.

### Execution

Confirming saves the gift, its details and one row per recipient (pending or skipped) in one transaction, then returns. A worker started with `after()` processes the pending recipients, one transaction each:

1. pick the next pending recipient, then lock the user and credit account, then the recipient row (`SKIP LOCKED`; a worker that loses the race moves on). This is the order profile deletion takes them in, so the two cannot deadlock;
2. re-check that the recipient is still pending and eligible;
3. post the grant with ledger key `credit-gift:{giftId}:{userId}`;
4. `notify()` the participant: an inbox row and an email delivery row;
5. mark the recipient granted, linking the ledger entry and the notification.

A crash resumes where it stopped (the notifications cron picks up pending recipients every five minutes), and the ledger key makes a double grant impossible. When no recipient is pending, the gift is marked completed and the admin who sent it gets a summary in the bell.

### Gift page

`/dashboard/credits/gifts/[giftId]`: the message as sent, the internal note, who sent it and when, counts (recipients, granted, omitted, failed, read in the app, emails sent), and a row per recipient with their state, email state, read state, current balance and revocation.

- **Reenviar aviso** re-delivers the email for one recipient, to the address on file now. It never grants again. It is disabled, with the reason shown, while the last email is still on its way or while the address is on the bounce/spam list.
- **Retirar** posts a linked reversal of that recipient's grant. **Retirar a todos** does it for everyone holding the gift and also stops it for whoever the worker has not credited yet. The dialog counts how many balances would go negative. A revoked recipient gets a neutral inbox item and email ("Ajustamos tu saldo de créditos"), never a celebration: the unshown banner and any queued "Recibiste…" email are cancelled, and a gift email is checked against its gift right before it is sent.
- A gift's ledger entries are undone only from the gift page. The account and movements screens show "Retirar desde el regalo" instead of "Revertir", and the server refuses a revert of a gift entry from there.

### "Asignar créditos" dialog

The single-account dialog had one "Motivo" field that was both the internal reason and the text participants see in their movements. It now has two:

- **Motivo interno** (required): stays in the admin history.
- **Detalle para el participante** (optional): shown in the participant's movements.

Existing entries keep their reason visible to the participant, as before.

---

## 7. Participant experience

- **Bell** (flag `notifications`): unread badge, polled every 60 seconds while the tab is visible, on focus and after navigation. Desktop opens a popover with the latest items, "No leídas / Todas" and "Marcar todo como leído" (disabled when nothing is unread); phones go to the page.
- **Page** `/my_notifications`: category chips (Todas, Reservas, Pagos y créditos, Anuncios once phase 3 fills it, plus Administración for admins), date groups (Hoy, Ayer, Esta semana, Anteriores), per-item "Marcar como no leída" and "Archivar", and "Ver más".
- **Detail** `/my_notifications/[id]`: the full message signed "Productora Glitter" and its one action. Opening it marks it read.
- **Tapping an item** (Dennis, 2026-10-20). A message someone wrote, like a gift, opens its detail page so it is read whole, with the action as a button ("Ver mi billetera"). A system notice goes straight to its screen; one without a link opens its detail page. Links are always paths inside Glitter.
- **Empty states:** "Todavía no tenés notificaciones…" and, once everything is read, "¡Estás al día!".
- **Wallet:** a gift's movement reads "Regalo de Glitter", with its title and the full message.
- **Banner:** on the next visit, one calm banner: "Recibiste 20 créditos de regalo" (several gifts add up), with "Ver mi billetera". It shows once.
- **Email:** "Recibiste 20 créditos de regalo", the message, "Ver mi billetera". From "Productora Glitter".

All copy is in voseo.

---

## 8. Architecture

### Tables

- `notifications`: one row per person per event. `kind`, `category`, `title`, `body`, `action_path` (never a tokenised URL), `action_label`, `data` (participant-safe snapshot), `campaign_id`, `dedupe_key` with `unique(user_id, dedupe_key)`, `read_at`, `archived_at`, `celebrated_at`, `created_at`.
- `notification_deliveries`: one row per email to send. `template_key`, `recipient_email`, `payload` (snapshot), `status` (`pending`, `processing`, `sent`, `failed`, `skipped`), attempts, backoff, lease, `last_error`, `provider_message_id`, `idempotency_key` (unique), `resend_of_delivery_id`, `requested_by_user_id`.
- `notification_campaigns`: admin-initiated sends; phase 1 has one type, `credit_gift`. Status, public title and message, creator, timestamps.
- `notification_campaign_recipients`: one row per recipient: status, skip reason, attempts, `ledger_entry_id`, `notification_id`, revocation (`reversal_entry_id`, `revoked_at`, `revoked_by_user_id`). `unique(campaign_id, user_id)`.
- `credit_gift_details`: `amount_per_recipient`, `occasion`, `internal_note`.

The migration is generated from `db/schema.ts`. Every Vercel deploy applies it to its preview database, so once pushed it is fixed forward.

### Kind registry

Each kind declares its category, how its inbox copy and link are built from the snapshot, and its email template, sender and subject. Copy is defined once, next to the template. Phase 1 kinds: `credit_gift_received`, `credit_gift_revoked` (both with email), `credit_gift_completed` (admin, in-app only). Phase 2 adds the in-app copies of the queued emails (§11); a kind can also say whether tapping it opens its own page and whether it is sensitive.

### Delivery worker

`notify()` returns delivery ids; the caller schedules them with `after()` once the transaction commits. The worker claims a delivery with a five-minute lease, skips addresses on the bounce/complaint list (status `skipped`), renders the template from the stored snapshot and sends with idempotency key `notification-delivery-{id}`. Rejections retry with exponential backoff up to five attempts. The cron `/api/cron/morning/notifications` (every five minutes) drains pending deliveries with a time budget and pacing under Resend's rate limit, and resumes unfinished gifts.

### Reads

Unread count and list are route handlers (`GET /api/notifications`, `GET /api/notifications/unread-count`), owner-only and behind the flag. Retention is a read-time cutoff (`created_at` within 180 days); nothing deletes rows.

---

## 9. Finanzas

Checked 2026-10-18 against the finance module, which lives on the unmerged branch `claude/finanzas-implementation-docs-cdae6a` (develop only has `app/lib/finanzas/accounts.ts`, which nothing imports):

- **At grant time an `admin_grant` is not booked at all**: no income, no expense, no liability. The only credit inflow the generator books is an approved top-up (`credito_recibido`, cash in and `pasivos:creditos:participantes` up).
- **When granted credits are spent on a stand**, the allocation books `credito_aplicado`: the liability goes down and `ingresos:stands` goes up, as for purchased credits. Spending a gift therefore shows as stand revenue with no cost against it, and pushes the liability below what participants actually hold.
- The participant-credits check in `/diagnostico` reads "no cuadra" by the total of every grant, because its ledger side sums all entry types.
- This gap already exists for the "Asignar créditos" dialog and for overpayment refunds paid as credits (`refundOverpaymentAsCredits`, also `admin_grant`). For refunds it double counts, because that cash was already booked as income.

What gifts do about it: every gift entry carries `metadata.creditGiftId` and `metadata.occasion`. Finanzas can then book a gift as a cost (`gastos:cortesias` against `pasivos:creditos:participantes`) and a refund as a return of income, without guessing from the reason text. That booking rule belongs to the finance branch; it is not part of this phase.

---

## 10. Later phases

- **P2** Mirror the queued emails (12 reservation kinds, disciplinary notices, top-up rejection, participation decisions) through `notify()`. Admin copies land in Administración. Launch the bell for participants. In review: see §11.
- **P2b** Push notifications (Dennis, 2026-10-20): alerts in the operating system's notification center, not only in the bell.
  - **Step 0: installable Glitter (PWA)** (Dennis, 2026-10-20). Its own small PR, ahead of push. It can ship any time before the rest of P2b: installing is useful by itself (home-screen icon, full screen, no browser bar), and push on iPhone needs it.
    - **Today:** not installable. There is no manifest, and the largest logo in the repo is 160 px.
    - **Manifest:** `app/manifest.ts` (Next's built-in convention). Name and short name "Glitter", `start_url` `/`, `display: standalone`, brand background and theme colors, icons. Preview and development builds put `getEnvLabel()` in the name, as page titles do, so a staging install is told apart from production.
    - **Icons:** 192 and 512 px (Chrome requires both), a maskable 512 with a safe-zone margin (Android crops it to a circle or rounded square), and a 180 px `app/apple-icon.png` for iPhone. Needs square isotype artwork at 512 px or larger, or a vector source.
    - **Metadata:** `appleWebApp` (title, status bar style) in the root layout's `metadata`. `themeColor` goes in a `viewport` export, since it is deprecated in `metadata`, with light and dark values.
    - **No service worker yet.** Current Chrome and Edge offer install with just HTTPS, the manifest and some engagement; iPhone installs from Compartir → Agregar a inicio. The worker arrives with push (below), and it never caches pages, so a deploy is never hidden behind stale screens.
    - **No install banner.** Android and desktop browsers offer install themselves. The iPhone instructions come with the push control (below).
    - **Paths:** `proxy.ts`'s matcher already skips paths with a file extension, so Clerk does not touch the manifest or the icons.
    - **To test on real phones:**
      - Clerk sign-in inside the installed app.
      - iPhone copies Safari's cookies once, at install; after that, signing in or out in one does not reach the other.
      - Links that leave the site, such as UploadThing files, open in the browser and people can get back to the app.
    - **Done when:** Android Chrome and desktop Chrome or Edge offer "Instalar", the iPhone home-screen icon opens Glitter full screen with the right icon, and a signed-in person stays signed in after installing.
  - **How:** standard web push. The manifest from step 0, a service worker, VAPID keys as server secrets, and the `web-push` library on the server. No vendor and no native app.
  - **Service worker:** `public/sw.js`, with push and notification-click handlers only and no fetch handler. It is served with `Cache-Control: no-cache, no-store, must-revalidate` and a strict CSP through `next.config` headers, so an update reaches everyone on their next visit.
  - **Devices:** a `push_subscriptions` table, one row per browser or device a person allowed (endpoint, keys, a device label, last used). A subscription the push service reports as gone (404/410) is removed.
  - **Sending:** push is a third channel on the phase 1 delivery queue, next to in-app and email, with the same retries and per-delivery records. Each kind in the registry says whether it pushes; the text is the inbox title and body, and tapping opens the item. Sensitive kinds (disciplinary notices) push a generic "Tenés una notificación nueva" instead of their content.
  - **Asking permission:** never on page load. A "Recibir avisos en este dispositivo" control in the bell and in `/my_notifications`, offered again after a meaningful moment (a confirmed reservation, a gift). When the browser cannot do it, or permission was denied, the control stays visible, disabled, with the reason and how to change it.
  - **iPhone:** iOS delivers web push only to a site added to the home screen (iOS 16.4 and later). On an iPhone that has not added it, the control explains how ("Compartir → Agregar a inicio") instead of offering permission. Android and desktop browsers work without installing.
  - **Device list:** people see the devices that receive their avisos and can remove any of them.
  - **Rollout:** behind a `push_notifications` flag, admins first, like the bell.
  - **Done when:** a participant who turned it on (Android, desktop, or an iPhone with Glitter on the home screen) gets a system notification for a gift or a reservation update, and tapping it opens that item.
- **P3** Comunicados: BlockNote composer, audiences, preview, test send, schedule, report, retry, duplicate, edit or retract in-app. Opt-outs for announcements.
  - **Distribution lists** (Dennis, 2026-10-20), so admins pick a group instead of re-selecting people every time:
    - **One list per festival, automatic.** Every festival, past ones included, has a "Confirmados · <festival>" list (participants with a confirmed reservation). Nobody creates it; it is computed when used, so it is always current.
    - **Lists admins save:** a named filter (re-evaluated at send time) or a fixed, hand-picked group.
    - Lists are available in the comunicado audience picker and in the credit-gift recipient picker.
- **P4** Inline sends (profiles, activities, orders, programs, reminders) through `notify()`; visitor and guest mail gets delivery rows; per-participant Comunicaciones tab.
- **P5** Delivery events from the Resend webhook on deliveries; preferences page.
- **P6** Editable system copy; re-evaluate `@react-email/editor`.

---

## 11. Phase 2: the queued emails in the inbox

Every email queued through the two outboxes now also lands in the inbox of the person it is sent to, written in the same transaction that queues it. The emails themselves do not change. With that, the bell is ready to launch for participants.

The outboxes queue 21 kinds of email: the 12 in `RESERVATION_NOTIFICATION_KINDS` (which already include the top-up rejection and both participation decisions), 4 infraction notices and 5 sanction notices.

### Decisions

Proposed 2026-10-21, for Dennis to confirm in review. Each one is a small change if he decides otherwise.

| #   | Decision                  | Phase 2 rule                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Emails                    | Unchanged. They keep going out through `reservation_notification_jobs` and `disciplinary_notification_jobs`, rendered as today. The inbox items are in-app only kinds. Moving these emails onto `notification_deliveries` is later work.                                                                                                                                                      |
| 2   | Where the copy is written | Where the job is queued: `enqueueReservationNotification(s)` and the disciplinary `insertNotificationJob`, plus the worker when it rebuilds a sanction retry. Every current and future call site goes through those. Each job states its `audience`, participant or admin.                                                                                                                    |
| 3   | Strict mirror             | One inbox item per queued email, for the same person, only when the job is new. An email the outbox deduplicates away (a second proof for the same reservation) gets no item either. `settlement_rejected` gets none: its email is never sent while the reservation is still pending.                                                                                                         |
| 4   | Never blocks the change   | The copies are written in a savepoint. If it fails, they are lost and logged (`[notifications] Inbox copy … failed`, with the kind, the job and the Postgres code); the payment, cancellation or sanction still commits and its email still goes. If the change rolls back, so do they. The expired-sanction cron and the retry worker now write the job and its copy in one transaction too. |
| 5   | One read per event        | The emails one event queues (an owner and every admin) are mirrored together: one savepoint and one read of the reservation, festival, stands and people. These transactions hold the lock that serialises reservation writes, so the copies must not add a round of reads per admin.                                                                                                         |
| 6   | Snapshot                  | Read inside that transaction, so the item says what was true then: festival, stands ("B48 y B49"), names, reason or note, due date, setup date and place. Never an email address or the acting admin. Payments, deadlines and admin copies name the cobro's holder; releases and late partners speak as the booking's owner.                                                                  |
| 7   | Admin copies              | Their own kinds, in Administración, for whoever the outbox emails (role `admin`): new reservation, proof submitted, Bs0 review requested, confirmed with credits. Not for the admin who did it, nor for one paying their own cobro (they get the participant's copy).                                                                                                                         |
| 8   | Owner and partner         | Told apart where the email does (deadline extension, release, partner added). A partner's copy never says what the owner paid.                                                                                                                                                                                                                                                                |
| 9   | Opening an item           | An item opens its own page when it carries text someone wrote for this person: a gift's message, a cancellation or participation reason, a top-up rejection reason, a resolution, void or revocation note. Otherwise it goes straight to its screen. The registry decides, per item. A reason the code fills in ("Actualización administrativa") does not count.                              |
| 10  | Receipts start read       | An item about something the person just did themselves (their proof, their Bs0 request, their release, the partner they added) is written as read: it stays in their history without lighting the badge.                                                                                                                                                                                      |
| 11  | Disciplinary notices      | Category "Cuenta" (shown under Todas), link to the participant's history, which paused participants can now open too. Marked sensitive, so a push (P2b) will only say that something arrived. Reservation access reopening files under Reservas and links to that festival's map.                                                                                                             |
| 12  | Admin hints               | Fields whose text the participant reads (cancellation reason, participation reason, resolution, void and revocation notes) say "Lo va a ver el participante en el correo y en sus notificaciones."                                                                                                                                                                                            |
| 13  | Anuncios                  | The chip is hidden until phase 3 files comunicados there: an always-empty filter reads as something missing.                                                                                                                                                                                                                                                                                  |
| 14  | Launch                    | The `notifications` flag keeps its "Solo administración" default. Items are written for everyone from the deploy on, so flipping it later loses nothing; see the checklist below.                                                                                                                                                                                                             |
| 15  | No backfill               | Emails queued before the deploy get no item, as in phase 1.                                                                                                                                                                                                                                                                                                                                   |

### Kinds

Participant items:

| Outbox kind                       | Inbox kind                                       | Category         | Goes to                                                 |
| --------------------------------- | ------------------------------------------------ | ---------------- | ------------------------------------------------------- |
| `proof_submitted`                 | `reservation_proof_submitted`                    | Pagos y créditos | The reservation                                         |
| `zero_value_review_requested`     | `reservation_zero_value_review_requested`        | Reservas         | The reservation                                         |
| `settlement_approved`             | `reservation_confirmed`                          | Reservas         | The reservation                                         |
| `settlement_rejected`             | none (no email is sent)                          |                  |                                                         |
| `reservation_rejected`            | `reservation_cancelled`                          | Reservas         | The reservation, or its own page when there is a reason |
| `deadline_extended`               | `reservation_payment_deadline_extended`          | Pagos y créditos | The reservation                                         |
| `reservation_released`            | `reservation_released`                           | Reservas         | The festival's map, to reserve again                    |
| `late_partner_added`              | `reservation_partner_added`                      | Reservas         | The reservation                                         |
| `festival_participation_approved` | `festival_participation_approved`                | Reservas         | The festival's terms page, where reserving starts       |
| `festival_participation_rejected` | `festival_participation_rejected`                | Reservas         | Its own page                                            |
| `credit_top_up_rejected`          | `credit_top_up_rejected`                         | Pagos y créditos | Its own page, with "Ver mi billetera"                   |
| infraction notices (4)            | `infraction_{registered,edited,resolved,voided}` | Cuenta           | The history, or its own page when there is a note       |
| sanction notices (4)              | `sanction_{approved,edited,expired,revoked}`     | Cuenta           | The history, or its own page when there is a note       |
| reservation access reopened       | `sanction_reservation_access_enabled`            | Reservas         | That festival's map                                     |

Admin items, all in Administración: `reservation_created_admin` (the reservation's edit page), `reservation_proof_submitted_admin` and `reservation_zero_value_review_requested_admin` (Cobros in the console), `reservation_confirmed_with_credits_admin` (Créditos in the console).

### Launch checklist

1. Deploy. Items start being written for everyone.
2. As an admin in that environment: open the bell, check an Administración item and one mirrored participant item (for example, cancel and restore a test reservation, or reject a test top-up).
3. Optionally, target two or three trusted participants with the flag before opening it to everyone.
4. Dennis flips `notifications` to Pública in `/dashboard/feature_flags`, per environment.

The bell also waits until the person's profile has loaded, so an account still finishing sign-up does not get a bell whose inbox cannot load, and `/my_notifications` asks a signed-out visitor to sign in instead of answering "not found".

### Not in phase 2, and open questions

- The reservation payment reminder and the other emails sent inline rather than queued (profile, order, program and activity mail) stay in P4. Once the bell is public, the payment reminder is the one reservation email with no inbox item.
- A proof sent back for correction notifies nobody, by email or in the app. A follow-up kind could say "Revisá el pago de tu reserva" with the new deadline, never the admin's internal correction reason.
- A participant an admin assigns a stand to is not told until the payment reminder: `reservation_created` is only queued for admins. A participant item ("Te asignamos el espacio…") would be new copy, not a mirror.
- Query logging prints parameters for every statement, including the inbox copy and the outbox payloads; that predates phase 2.
