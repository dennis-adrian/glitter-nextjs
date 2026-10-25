# PRD: In-app notifications and credit gifts

**Product:** Glitter
**Feature area:** Participant inbox, admin communications, credits
**Status:** Phases 1 and 2 (with push and the installable app) released in v2.87.0, behind their flags; the real-device checks and launch steps are still open (§11, and P2b in §10). Phase 3 (comunicados and distribution lists) designed in §12: decisions agreed 2026-10-24, proposed defaults awaiting approval; not started.
**Last updated:** 2026-10-24

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
- **Detail** `/my_notifications/[id]`: the full message and its one action, with no sign-off (Dennis, 2026-10-21; the gift emails have none either). Opening it marks it read.
- **Tapping an item** (Dennis, 2026-10-20). A message someone wrote, like a gift, opens its detail page so it is read whole, with the action as a button ("Ver mi billetera"). A system notice goes straight to its screen; one without a link opens its detail page. Links are always paths inside Glitter.
- **Empty states:** "Todavía no tenés notificaciones…" and, once everything is read, "¡Estás al día!".
- **Wallet:** a gift's movement reads "Regalo de Glitter", with its title and the full message.
- **Banner:** on the next visit, one calm banner: "Recibiste 20 créditos de regalo" (several gifts add up), with "Ver mi billetera". It shows once, and only for credit gifts. Since 2026-10-24 (Dennis saw it beside the gift it announced): reading a gift counts as seeing it, so there is no banner for a gift already opened (from the inbox or a tap), even if it is marked unread later; it is gone once the person leaves the page it appeared on, and never shows on the wallet or the gift's own page.
- **Email:** "Recibiste 20 créditos de regalo", the message, "Ver mi billetera". From "Productora Glitter".

All copy is in voseo.

---

## 8. Architecture

### Tables

- `notifications`: one row per person per event. `kind`, `category`, `title`, `body`, `action_path` (never a tokenised URL), `action_label`, `data` (participant-safe snapshot), `campaign_id`, `dedupe_key` with `unique(user_id, dedupe_key)`, `read_at`, `archived_at`, `celebrated_at`, `created_at`.
- `notification_deliveries`: one row per email (and, since P2b, per push) to send. `template_key`, `recipient_email` (email rows only), `payload` (the email's snapshot; empty for push, which is built when sent), `status` (`pending`, `processing`, `sent`, `failed`, `skipped`), attempts, backoff, lease, `last_error`, `provider_message_id`, `idempotency_key` (unique), `resend_of_delivery_id`, `requested_by_user_id`.
- `notification_campaigns`: admin-initiated sends; phase 1 has one type, `credit_gift`. Status, public title and message, creator, timestamps.
- `notification_campaign_recipients`: one row per recipient: status, skip reason, attempts, `ledger_entry_id`, `notification_id`, revocation (`reversal_entry_id`, `revoked_at`, `revoked_by_user_id`). `unique(campaign_id, user_id)`.
- `credit_gift_details`: `amount_per_recipient`, `occasion`, `internal_note`.
- P2b adds `push_subscriptions` and the deliveries' `channel` and `push_subscription_id`; see P2b in §10.

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

- **P2** Mirror the queued emails (12 reservation kinds, disciplinary notices, top-up rejection, participation decisions) through `notify()`. Admin copies land in Administración. Launch the bell for participants. Released in v2.87.0 (#591); see §11 for its launch checklist.
- **P2b** Push notifications (Dennis, 2026-10-20): alerts in the operating system's notification center, not only in the bell.
  - **Step 0: installable Glitter (PWA)** (Dennis, 2026-10-20). Its own small PR, ahead of push. It can ship any time before the rest of P2b: installing is useful by itself (home-screen icon, full screen, no browser bar), and push on iPhone needs it.
    - **Status (2026-10-22):** merged to develop (#593). The icons and launch screens are drawn from Dennis's SVG isotype (`public/img/logo/glitter-isotype.svg`) by `pnpm app-images` (`scripts/generate-app-images.ts`), on the brand purple `#6523e6` (`primary-600`). The browser bar matches the navbar (`--brand-elevated`), following the theme picked in Glitter once the page loads and the device's light or dark setting before that. In a local Next app that streams its metadata as the home page does, Chromium reports no installability errors with these tags. The real-phone checks below are still to do.
    - **Manifest:** `app/manifest.ts` (Next's built-in convention). Name and short name "Glitter", `start_url` `/`, `display: standalone`, brand background and theme colors, icons. Preview and development builds put `getEnvLabel()` in the name, as page titles do, so a staging install is told apart from production.
    - **Icons:** 192 and 512 px (Chrome requires both), and a 180 px `public/icons/glitter-apple-180.png` for iPhone. The artwork stays within the 80% circle Android keeps when it crops an icon, on purple to the edges, so the 512 px icon also serves as the maskable one.
    - **Launch screen:** the isotype centred on purple, full screen, while the installed app opens.
      - Android builds it from the manifest: `background_color` and the icon, with `theme_color` (the same purple) on the status bar until the page's own colour takes over. Desktop windows open on the purple for a moment.
      - iPhone and iPad ignore the manifest for this. They need an `apple-touch-startup-image` per screen size and orientation, at the screen's exact pixel size, or they show white: 42 images in `public/splash/`, listed in `app/lib/launch-screens.ts`, about 10 KB each. A new iPhone size needs a row there and `pnpm app-images`. Display Zoom sizes are not listed, so a zoomed iPhone opens on white. iOS keeps the image it got when Glitter was added to the home screen, so an existing install shows the new one only after it is removed and added again.
    - **Head tags:** the manifest link, the apple icon, `apple-mobile-web-app-capable` (which iOS still needs for launch screens), title, status bar style and the launch screens are rendered by `app/components/installed-app-head.tsx` in the root layout, not through `metadata`. Next streams a page's metadata into `<body>` when the page has an async `generateMetadata` (the home page and 13 other routes do), and browsers read these tags only from `<head>`; React moves them there because the root layout renders them before anything waits for data. Next still adds its own manifest link for `app/manifest.ts`; browsers use whichever comes first in `<head>`. Ours always sends cookies, as Next's does on previews, so a preview behind Vercel's login can serve the manifest. `themeColor` stays in the `viewport` export, which Next always puts in `<head>`, with light and dark values.
    - **No service worker needed to install.** Current Chrome and Edge offer install with just HTTPS, the manifest and some engagement; iPhone installs from Compartir → Agregar a inicio. The worker came with push (`public/sw.js`, below), and it never caches pages, so a deploy is never hidden behind stale screens.
    - **No install banner.** Android and desktop browsers offer install themselves. The iPhone instructions come with the push control (below).
    - **Paths:** `proxy.ts`'s matcher already skips paths with a file extension, so Clerk does not touch the manifest or the icons.
    - **To test on real phones:**
      - Clerk sign-in inside the installed app.
      - iPhone copies Safari's cookies once, at install; after that, signing in or out in one does not reach the other.
      - Links that leave the site, such as UploadThing files, open in the browser and people can get back to the app.
      - The launch screen on Android, and on an iPhone and an iPad in both orientations, added to the home screen after this change.
    - **Done when:** Android Chrome and desktop Chrome or Edge offer "Instalar", the iPhone home-screen icon is the right one and opens Glitter full screen after the purple launch screen, and a signed-in person stays signed in after installing.
  - **How:** standard web push. The manifest from step 0, a service worker, VAPID keys as server secrets, and the `web-push` library on the server. No vendor and no native app.
  - **Service worker:** `public/sw.js`, with push and notification-click handlers only and no fetch handler. It is served with `Cache-Control: no-cache, no-store, must-revalidate` and a strict CSP through `next.config` headers, so an update reaches everyone on their next visit.
  - **Devices:** a `push_subscriptions` table, one row per browser or device a person allowed (endpoint, keys, a device label, last used). A subscription the push service reports as gone (404/410) is removed.
  - **Sending:** push is a third channel on the phase 1 delivery queue, next to in-app and email, with the same retries and per-delivery records. Each kind in the registry says whether it pushes; the text is the inbox title and body, and tapping opens the item. Sensitive kinds (disciplinary notices) push a generic "Tenés una notificación nueva" instead of their content.
  - **Asking permission:** never on page load. A "Recibir notificaciones en este dispositivo" control in the bell and in `/my_notifications`, offered again after a meaningful moment (a confirmed reservation, a gift). When the browser cannot do it, or permission was denied, the control stays visible, disabled, with the reason and how to change it.
  - **iPhone:** iOS delivers web push only to a site added to the home screen (iOS 16.4 and later). On an iPhone that has not added it, the control explains how ("Compartir → Agregar a inicio") instead of offering permission. Android and desktop browsers work without installing.
  - **Device list:** people see the devices that receive their push notifications and can remove any of them.
  - **Rollout:** behind a `push_notifications` flag, admins first, like the bell.
  - **Done when:** a participant who turned it on (Android, desktop, or an iPhone with Glitter on the home screen) gets a system notification for a gift or a reservation update, and tapping it opens that item.
  - **Status (2026-10-22):** merged to develop (#594, then #593 with step 0). Migration `0300_push_notifications`. What was decided while building it:
    - **Keys:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:soporte@productoraglitter.com`), one pair for Production and one for Preview and Development, set by Dennis in Vercel. All optional: without them, or with a public and private key from different pairs, push is off and the control says so; the build never fails over them. The public key reaches the control from the server, so there is no `NEXT_PUBLIC_` copy to keep in sync.
    - **Delivery rows:** one per device (`notification_deliveries.channel = 'push'`, `push_subscription_id`), written by `notify()` in the same transaction with one `INSERT … SELECT` and no read first. A push row keeps no payload: it is built from the inbox item when sent, so a profile-deletion scrub or an archive reaches it. Each device records the key it subscribed with; a server running other keys leaves the push for one that can send it.
    - **Which kinds push:** `push: true` in the registry. Every participant kind, except receipts that start read; disciplinary notices push "Tenés una notificación nueva" with title "Glitter". Of the Administración copies, only the two that ask an admin to act (a proof to review, a zero-value request). Items carrying text someone wrote (a gift's message, a reason, the title of a revoked gift with any debt) push their title and "Tocá para ver el detalle.", since a lock screen cannot be recalled; others push the first paragraph of the body. A revoked gift therefore opens its own page in the inbox too, as a received one does.
    - **Tapping** does what tapping the item in the inbox does: `/my_notifications/{id}/open` marks it read and redirects to its screen (a reservation update to its reservation), or to its own page when it carries text someone wrote, as every gift does (that page has "Ver mi billetera"). A disciplinary notice opens its own page too: its push said only that something arrived, while the inbox row shows what before the tap. Dennis asked on 2026-10-24 that a tap land where the item leads, marked read (he named the wallet for a gift); both exceptions follow the inbox and are his to change. It used to open the item's page for every kind. A request to `/open` from another site (`Sec-Fetch-Site: cross-site`) is redirected the same way but marks nothing, so a link elsewhere cannot mark someone's notifications read.
    - **Copy:** participants read "notificaciones", never "avisos" (Dennis, 2026-10-24): "Recibir notificaciones en este dispositivo", "Notificaciones en este dispositivo". The flag is "Notificaciones en el dispositivo".
    - **Opening a tap** (2026-10-24, after testing on an iPhone): a window's address is the page it first loaded, not where the app navigated since, so the worker cannot tell from it whether a window is in the inbox. It asks the open window instead (`glitter:open`, 400 ms): the iPhone app always accepts, any other window (a browser tab, an app installed on a computer) only when it is in the inbox, and the page then goes to the item itself. It does so without reloading (Dennis, 2026-10-24: a tap took seconds), since the push carries where it lands (`href`, the open route's destination): the router shows the destination's loading state as soon as the server answers, and the page reads the item through `/open` with a background request (its path holds across deploys, and it leaves the opened-tap cookie). It first waits up to two seconds for Clerk to renew a session token that expired in the background; an in-app request carrying an expired one is sent to sign in, so when the renewal fails or takes longer it reloads through `/open` instead, as does a push from before `href`. Declined or unanswered, the worker leaves that window as it is, since a page asleep in the background may hold a form half filled, and opens the link in a new one. On an iPhone, opening a window only brings a running app forward, a closed one may open at its start page, and iOS may not report a tap on a running app at all (WebKit bug 268797), so:
      - the worker keeps the last tap for two minutes, and the iPhone app (or a window in the inbox) finishes it when it loads or comes back, unless its link already loaded (the open route leaves a cookie) or it is on the sign-in page, which goes on to it;
      - in the iPhone app, what arrived while it was in the background is offered in a toast when it comes back ("Ver", 10 seconds), and what arrives while it is on screen at once; once per item, and never in the inbox, which lists them itself;
      - the inbox list and the bell refresh when Glitter comes back, when a notification arrives while it is open, and once a change made in them is saved.
    - **Sending:** right after the commit (gifts through their delivery ids; reservation and disciplinary paths through a drain of the pushes they just queued), then the notifications cron. Not spaced like email. TTL 48 h; an older push is skipped. 404/410 removes the device; a 429 with Retry-After waits as asked without spending an attempt (without one, it retries like a 5xx); 400/401/403/413 fail without removing it (a key mistake must not wipe every device); 5xx and timeouts retry like email. Skipped too: read, archived, admin copies for someone no longer admin, a profile being deleted, flags off for the recipient (checked at send time with their role).
    - **Endpoints** must belong to FCM, Mozilla, Apple (`*.push.apple.com`) or WNS (`*.notify.windows.com`), with a plain host both URL parsers read the same way; checked when saved and again before each send. Endpoints and keys never reach the client, the logs or a delivery row.
    - **Devices:** at most 10 per person (the least recently used goes). A browser saved under another account moves to whoever turns them on there, only with the same keys; signing out unsubscribes this browser first and then forgets it, and clears what the worker kept there (the last tap and the last five arrivals); once per session a signed-in page also lets go of a browser still saved under someone else. Starting a profile deletion removes that person's devices.
    - **Control:** `/my_notifications` card (one line once on, with "Tus dispositivos" folded), the bell's footer (desktop, with a note when blocked), and offers on a reservation in "Pago en revisión" or "Confirmada" and in the gift banner. The permission prompt comes straight from the tap. iPhone and iPad get the home-screen steps, Instagram's browser a line to open Safari, iOS before 16.4 the version it needs.
    - **Loading states:** the inbox (in a route group of its own, so its skeleton never covers an item) and an item's page show theirs the moment they are opened. An item gone since its push was sent redirects to the inbox, as the open route does. Without one below the layout every page shares, a navigation inside Glitter waits for the whole server render (the root's loading state sits above it), which is what made the bell slow. Their reads also run in parallel.
    - **To check on real devices:** subscribe, receive and tap on Android Chrome, desktop Chrome, Edge, Firefox and Safari, and an iPhone with Glitter on the home screen; that the prompt does not close the bell's popover; sign-out stops push notifications; a tap with the app closed, in the background and open lands on the item, marked read (a gift on its own page); with the iPhone app on screen, an arriving notification shows a toast; `curl -I /sw.js` on a preview shows the no-store and CSP headers.
    - **Launch and rollback:** `notifications` goes public before `push_notifications` leaves `admin_only` (a tap opens the inbox item). The admins-first phase includes festival admins, as with the bell. Rolling back is setting `push_notifications` to hidden: the worker checks it at send time and stops, within 30 seconds (it caches the flags that long). Anyone targeted on the flag by name keeps push notifications while it is hidden, since targeting wins, so remove them from it too. Never a code revert once 0300 is applied, since the old worker would send queued push rows down the email path; if one is unavoidable, first `UPDATE notification_deliveries SET status = 'skipped', last_error = 'rollback' WHERE channel = 'push' AND status IN ('pending', 'processing')`.
    - **Keys and operations:** one VAPID pair per database (Preview and Development share theirs), generated with `pnpm exec web-push generate-vapid-keys`, stored in Vercel as Sensitive, never committed and never rotated: rotating orphans every device. Vercel runs crons only in production, so on a preview only the after-commit sends run; retries need the notifications cron called by hand with `CRON_SECRET`. What happened to recent pushes: `SELECT status, last_error, count(*) FROM notification_deliveries WHERE channel = 'push' AND created_at > now() - interval '1 day' GROUP BY 1, 2`.
- **P3** Comunicados: BlockNote composer, audiences, preview, test send, schedule, report, retry, duplicate, edit or retract after sending (the inbox and the emails not sent yet), optional push. Opt-outs for announcements. Distribution lists (Dennis, 2026-10-20), shared with credit gifts. Designed on 2026-10-24: see §12.
- **P4** Inline sends (profiles, activities, orders, programs, reminders) through `notify()`; visitor and guest mail gets delivery rows; comunicados to visitors; per-participant Comunicaciones tab.
- **P5** Delivery events from the Resend webhook on deliveries; preferences page.
- **P6** Editable system copy; re-evaluate `@react-email/editor`.

---

## 11. Phase 2: the queued emails in the inbox

Every email queued through the two outboxes now also lands in the inbox of the person it is sent to, written in the same transaction that queues it. The emails themselves do not change. With that, the bell is ready to launch for participants.

The outboxes queue 21 kinds of email: the 12 in `RESERVATION_NOTIFICATION_KINDS` (which already include the top-up rejection and both participation decisions), 4 infraction notices and 5 sanction notices.

### Decisions

Proposed 2026-10-21 and merged as written (#591), except that decision 5 then batched only owner-and-admin emails; the emails sent to every participant were batched in a follow-up. Each one is a small change if Dennis decides otherwise.

| #   | Decision                  | Phase 2 rule                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Emails                    | Unchanged. They keep going out through `reservation_notification_jobs` and `disciplinary_notification_jobs`, rendered as today. The inbox items are in-app only kinds. Moving these emails onto `notification_deliveries` is later work.                                                                                                                                                      |
| 2   | Where the copy is written | Where the job is queued: `enqueueReservationNotification(s)` and the disciplinary `insertNotificationJob`, plus the worker when it rebuilds a sanction retry. Every current and future call site goes through those. Each job states its `audience`, participant or admin.                                                                                                                    |
| 3   | Strict mirror             | One inbox item per queued email, for the same person, only when the job is new. An email the outbox deduplicates away (a second proof for the same reservation) gets no item either. `settlement_rejected` gets none: its email is never sent while the reservation is still pending.                                                                                                         |
| 4   | Never blocks the change   | The copies are written in a savepoint. If it fails, they are lost and logged (`[notifications] Inbox copy … failed`, with the kind, the job and the Postgres code); the payment, cancellation or sanction still commits and its email still goes. If the change rolls back, so do they. The expired-sanction cron and the retry worker now write the job and its copy in one transaction too. |
| 5   | One read per event        | The emails one event queues (an owner and every admin, or every participant on a reservation) are mirrored together: one savepoint and one read of the reservation, festival, stands and people. These transactions hold the lock that serialises reservation writes, so the copies must not add a round of reads per admin.                                                                  |
| 6   | Snapshot                  | Read inside that transaction, so the item says what was true then: festival, stands ("B48 y B49"), names, reason or note, due date, setup date and place. Never an email address or the acting admin. Payments, deadlines and admin copies name the cobro's holder; releases and late partners speak as the booking's owner.                                                                  |
| 7   | Admin copies              | Their own kinds, in Administración, for whoever the outbox emails (role `admin`): new reservation, proof submitted, Bs0 review requested, confirmed with credits. Not for the admin who did it, nor for one paying their own cobro (they get the participant's copy).                                                                                                                         |
| 8   | Owner and partner         | Told apart where the email does (deadline extension, release, partner added). A partner's copy never says what the owner paid.                                                                                                                                                                                                                                                                |
| 9   | Opening an item           | An item opens its own page when it carries text someone wrote for this person: a gift's message, a cancellation or participation reason, a top-up rejection reason, a resolution, void or revocation note. Otherwise it goes straight to its screen. The registry decides, per item. A reason the code fills in ("Actualización administrativa") does not count.                              |
| 10  | Receipts start read       | An item about something the person just did themselves (their proof, their Bs0 request, their release, the partner they added) is written as read: it stays in their history without lighting the badge. A voucher an admin uploads for them from the console is news instead: its copy says it was registered for them, and it starts unread.                                                |
| 11  | Disciplinary notices      | Category "Cuenta" (shown under Todas), link to the participant's history, which paused participants can now open too. Marked sensitive, so its push (P2b) only says that something arrived. Reservation access reopening files under Reservas and links to that festival's map.                                                                                                               |
| 12  | Admin hints               | Fields whose text the participant reads (cancellation reason, participation reason, resolution, void and revocation notes) say "Lo va a ver el participante en el correo y en sus notificaciones."                                                                                                                                                                                            |
| 13  | Anuncios                  | The chip is hidden until phase 3 files comunicados there: an always-empty filter reads as something missing.                                                                                                                                                                                                                                                                                  |
| 14  | Launch                    | The `notifications` flag keeps its "Solo administración" default. Items are written for everyone from the deploy on, so flipping it later loses nothing; see the checklist below.                                                                                                                                                                                                             |
| 15  | No backfill               | Emails queued before the deploy get no item, as in phase 1.                                                                                                                                                                                                                                                                                                                                   |
| 16  | Deleting a profile        | Admin copies and partners' items name other people. Each stores the named person's id next to the name, and deleting that profile (by request or by the deletion cron) rewrites those items with "Perfil eliminado", as program purchases already do. The person's own items go with their user row.                                                                                          |

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

The bell also waits until the person's profile has loaded (holding its place meanwhile, without asking for a count), so an account still finishing sign-up does not get a bell whose inbox cannot load, and `/my_notifications` asks a signed-out visitor to sign in instead of answering "not found".

### Not in phase 2, and open questions

- The reservation payment reminder and the other emails sent inline rather than queued (profile, order, program and activity mail) stay in P4. Once the bell is public, the payment reminder is the one reservation email with no inbox item.
- A proof sent back for correction notifies nobody, by email or in the app. A follow-up kind could say "Revisá el pago de tu reserva" with the new deadline, never the admin's internal correction reason.
- A participant an admin assigns a stand to is not told until the payment reminder: `reservation_created` is only queued for admins. A participant item ("Te asignamos el espacio…") would be new copy, not a mirror.
- Query logging prints parameters for every statement, including the inbox copy and the outbox payloads; that predates phase 2.

---

## 12. Phase 3: comunicados and distribution lists

An admin writes an announcement once and sends it to any mix of festivals' confirmed participants, saved lists and people picked by name. It lands in their inbox under Anuncios, by email unless the admin unticks it, and on their devices only when the admin ticks it. Admins can schedule it, edit or retract it after it goes out, and see on its page what reached whom on each channel. The same lists also feed the credit-gift picker.

This section holds what was decided and what people see. The mechanics (tables, SQL, the bulk email protocol, concurrency, invariants and the tests each PR adds) are in [`docs/IMPLEMENTATION-comunicados.md`](IMPLEMENTATION-comunicados.md), whose open questions K1–K16 are the proposed defaults below.

Everything admins see ships behind a new `comunicados` flag, hidden by default with the global admins targeted by name, so each PR can reach production unseen by anyone else; participants see nothing until a comunicado is sent to them. The exception is PR 2: it changes how every Glitter email is picked and retried, so it reaches production alone first (Launch, step 1).

### Decisions

Agreed with Dennis on 2026-10-24.

| #   | Decision            | Phase 3 rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Channels            | The inbox, always. Email, on by default; the admin can untick it. A push to the device only when the admin ticks it, for something urgent.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2   | Who sends           | Global admins only, for now.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3   | Who receives        | Participants, by the gift rule (§5): role `user`, verified or paused, no pending profile deletion. Checked in every count, when the send starts, and again before each inbox item and each email, so someone banned, or who asked to delete their profile, in between is skipped. Visitors wait for phase 4. Admins receive one only as stand-ins on a preview (decision 8) or when picked by name (default 12).                                                                                                                                             |
| 4   | Confirmados         | "Confirmados · \<festival\>" holds the owners and the partners of the festival's accepted reservations, each person once. Every festival has one, past ones included (Dennis, 2026-10-20). Nobody creates it; it is computed each time it is used.                                                                                                                                                                                                                                                                                                           |
| 5   | Opt-out, essential  | One email topic, Anuncios: every comunicado email has "Darme de baja" and the one-click unsubscribe headers, except an essential email to someone who already unsubscribed from Anuncios: it keeps the footer link but leaves out the headers, since a one-click press there would change nothing. A comunicado to a festival's Confirmados can be marked **correo esencial**, with a reason; its email then also reaches people who unsubscribed from Anuncios (scope: default 11; the `all` opt-out: default 10). Who marked it, when and why is recorded. |
| 6   | Size                | The largest expected audience is 500 to 2,000 people. The hard cap is 3,000 (default 15).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | Editing, retracting | Editing rewrites everyone's inbox item, marked "Editado" where it may have been seen. Emails not sent yet go out with the new text: each takes the current text when it is sent, which is "cancel and re-queue" in effect without losing its place. Emails already sent stay as they were. Retracting removes the item from everyone's inbox and cancels the emails and pushes not sent yet.                                                                                                                                                                 |
| 8   | Previews, people    | Previews send real email and share one database. There, a send to a festival or a list goes to the global admins instead; list members get nothing and show in the report as "Entorno de prueba: no se envía a listas". People can be picked by name in every environment, so a comunicado can go to exactly one person; on a preview, people picked by name still receive it themselves (inbox, push if ticked, and a real email marked as a test).                                                                                                         |
| 9   | Resend plan         | Pro: 50,000 emails a month, no daily cap, shared with every Glitter email. A 2,000-person comunicado is 4% of it, so about 20 full sends fit in a month while other Glitter mail stays under about 10,000 (Resend → Settings → Usage shows it). If the allowance ran out, every Glitter email would stop until the month renews.                                                                                                                                                                                                                             |

**Proposed defaults.** The design needed these and they are not decided yet. Each is Dennis's to change; most are a constant or a line, and the row says when one costs more. Smaller details in the sections below (limits on copy, pacing, labels) are design choices too, and as open to change.

| #   | Question                     | Default                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | Essential and "all" opt-outs | An essential email overrides the Anuncios opt-out only. Someone who asked support to stop all bulk mail (`all`) never gets a comunicado email, even an essential one: the unsubscribe page told them "Ya no enviaremos todos nuestros correos masivos". They still see the comunicado in the app.                                                                                                                                                   |
| 11  | What can be essential        | A comunicado whose audience is exactly one festival's Confirmados (no other list, nobody added by name) with email ticked, for a festival that is current or upcoming: not archived, and its last day at most 7 days ago. That covers the example, a setup-time change; a festival long over cannot get essential sends. The record is kept for good, so the admin who confirmed one cannot have their profile deleted, as with infraction authors. |
| 12  | Admins picked by name        | People picked by name may include global admins, so an admin can send a real comunicado to themselves, or to a colleague, before a large send. Lists only ever deliver to participants.                                                                                                                                                                                                                                                             |
| 13  | Local development            | Treated like a preview: sends to lists go to the admins, and scheduling is refused (that database's own cron would send it unnarrowed). A local server may point at a shared database, and push is real there when the keys are set. Development sends no email.                                                                                                                                                                                    |
| 14  | Festival admins              | No access to Comunicaciones in phase 3, not even to view. Gifts let them view with the button disabled (§4); read-only access later is a small change.                                                                                                                                                                                                                                                                                              |
| 15  | Limits                       | At most 3,000 recipients per comunicado, 10 festivals and lists, 100 people by name, 3,000 people per hand-picked list. Title up to 80 characters, text up to 5,000. Schedules 5 minutes to 60 days ahead. At 300 recipients or more, and for every essential send, the admin types the number of recipients to confirm.                                                                                                                            |
| 16  | Late schedules               | A scheduled comunicado more than an hour late (a cron outage, say) is not sent: it goes back to draft, and the admin who scheduled it (every global admin, if that person no longer is one) gets a bell item, in the app only. "Mañana el armado empieza a las 8:00" sent two days late does harm.                                                                                                                                                  |
| 17  | `{nombre}`                   | Not in phase 3. The email greets each person by name automatically ("¡Hola Ana!"); the text cannot use the name. The inbox never greets, as gift items don't. Adding it later costs a name copy per recipient and a per-person rewrite on each edit.                                                                                                                                                                                                |
| 18  | Edits                        | An edit changes the title, the text and the button; the audience, the channels and the essential mark are fixed once sent. It keeps the read state and does not alert again. For a change that matters to people who already read it, send a new comunicado.                                                                                                                                                                                        |
| 19  | Sender                       | "Productora Glitter \<anuncios@productoraglitter.com\>", a new address on the verified domain, with replies to `soporte@productoraglitter.com` (or `eventos@`, which participant invitations use). No subdomain of its own: `anuncios.productoraglitter.com` would keep bulk reputation apart from reservation mail, at the cost of new DNS records in Resend.                                                                                      |
| 20  | Saved filters                | Área, Categorías, Departamento, "Con reserva confirmada en" and "Sin reserva confirmada en" (one or more festivals), and "Incluir pausados". Tags, gender, participation type, complete profile and sanctions would be one field each, later.                                                                                                                                                                                                       |
| 21  | Images                       | Yes, as the last PR, once the text-only flow works: JPG or PNG only (WebP and SVG break in Outlook and Gmail), at most 6. An image in an email already sent can only be recalled by deleting the file. A whole PR of its own.                                                                                                                                                                                                                       |
| 22  | Scheduled sends              | Not confirmed again at release: a scheduled send goes to whoever the lists hold then, up to the 3,000 cap, even if that is more than the number typed when it was scheduled. Alternative: refuse at release when the audience grew more than 10%.                                                                                                                                                                                                   |
| 23  | Anuncios is its own opt-out  | Someone who opted out of festival invitations ("Avisos a participantes") still gets comunicado email; the `all` opt-out covers both. Alternative: Anuncios also honours that opt-out.                                                                                                                                                                                                                                                               |
| 24  | Lists in the gift picker     | Production only, since gifts cannot be narrowed to admins on a preview. The 100-recipient cap of a gift stays (§4, decision 2), so a festival's Confirmados, usually larger, is refused; in practice the gift picker takes saved lists of 100 or fewer. Raising the cap is Dennis's call.                                                                                                                                                           |

### Audiences

- **Sources.** "Confirmados · \<festival\>" (any festival), saved lists, and people picked by name or email. Each person counts once; someone both on a list and picked by name counts as picked by name (so on a preview they still receive it).
- **Confirmados.** Pre-reveal reservations are included: the list is only seen by admins, and each recipient sees only their own copy. Members with another role (an admin who owns a stand, an `artist` partner) stay in the list and are skipped as "No es participante".
- **Saved lists** are either "Con filtros", re-evaluated every time they are used, or "Elegida a mano", a fixed group. Filter attributes are combined with "and", the values within one with "or"; no filter at all means every eligible participant. If a saved filter can no longer be read (after a code change, say), the send is refused; it never turns into "everyone". Lists are archived, never deleted, and names are unique among active lists.
- **When the audience is fixed.** When the send starts, never when it is scheduled: a list is "computed when used". A scheduled send is not confirmed again (default 22). For "Enviar ahora", if the admin typed the count and it changed before the send started, it stops: "La audiencia cambió: ahora son 1.251 personas. Revisá y confirmá de nuevo."
- **One number everywhere.** The lists page, the composer, the confirm dialog and the gift picker all show "pueden recibirlo hoy", with "· N no lo reciben" and the gift reasons (§5). The comunicado's report adds two of its own: "Entorno de prueba: no se envía a listas" and "Retirado antes de enviarse".
- **In the gift picker** (default 24). "Agregar una lista" adds a list's eligible members as if picked one by one, so the gift itself does not change. When the people already chosen plus the list would pass 100, it adds nobody and says so: "Con «Confirmados · Glitter Navidad 2026» serían 340 personas y un regalo llega a 100 como máximo. Elegí una lista más chica o agregá personas una por una."

### Writing

- **Composer** (`/dashboard/communications/[id]`, opened with "Nuevo comunicado" on the Comunicados page): one page, saved as a draft as the admin types. Title (it is the email subject and the push title), text, an optional button, recipients and channels, with a preview beside them: Notificación · Detalle · Correo · Dispositivo.
- **Text.** BlockNote, limited to what displays well in email clients: paragraphs, two heading levels, lists (two levels deep), quotes, dividers, links, bold and italic. No colours, underline, strike, tables or code. Formatting pasted from Word or Google Docs is cleaned on save. The email must stay under 90 KB (Gmail cuts longer ones).
- **Button.** A label and a page of Glitter, never another site. §7's rule ("links are always paths inside Glitter") covers the item's own link and button; links inside the text may go anywhere (https, http or mailto).
- **Rendering**, always on the server from the blocks, never from browser HTML: sanitized HTML for the item's page, an email with inline styles and absolute links, and plain text for the inbox excerpt and the email's text part. BlockNote's own email exporter is licensed GPL-3.0 or paid, so the email renderer is ours.
- **"Enviarme una prueba"** sends only one email, to the admin who presses it, with the subject "[Prueba] …": no inbox item, no push, nothing in any report; five per 10 minutes. To try the inbox and the push, an admin picks themselves by name (default 12) and sends: a real send, kept under Enviados.
- **Confirming** shows recipients, how many get it in the app, by email and on a device, and who doesn't and why, with callouts when they apply: essential (who it reaches despite opting out, and who it still doesn't), a push cannot be recalled, a test environment, the bell not yet public. "Programar" uses the same dialog with a date.

### Sending

- **Starting.** "Enviar" freezes the audience (one row per person) and the content (version 1) in one step. A double click is one send.
- **Inbox items** for 2,000 people appear within a few seconds; a crash resumes where it stopped, without duplicates. Each person is checked again as their item is written.
- **Email never queues ahead of transactional email.** Comunicado email has a lane of its own, sent 100 per Resend request, one request at a time across every server: about 2 to 3 minutes for 2,000 in production. It uses under half a request per second of Resend's limit (10 per second per team by default, per Resend's docs; older pages said 2 or 5; Resend → Settings → Usage shows the account's own), so other mail is rarely slowed, and a collision costs one retry of at most two seconds.
- **Each email takes the current text** when it goes out, and is checked just before: retracted, no longer eligible, profile being deleted, address changed since, unsubscribed, bounced or reported.
- **Unclear outcomes.** If Resend doesn't confirm whether some emails went out, they are never sent again as a new request: the report shows "Puede haber llegado" and "Reintentar fallidos" skips them. An email still unsent 20 hours after the send is dropped as "Venció sin enviarse", and "Reintentar fallidos" can send it then; past 24 hours Resend would no longer recognise a repeat.
- **The monthly allowance.** If Resend refuses for it, the comunicado's remaining emails are marked failed, to be retried once it renews, and the page says so.
- **Who drives it.** The send's own background work does most of a 2,000-person send (about half when push is ticked); a new per-minute cron (`/api/cron/morning/comunicados`) finishes it and releases schedules. It is separate from the notifications cron, whose budget and order stay as they are. Previews have no crons, so there the Comunicados page, and a comunicado that stopped moving, offer "Procesar envíos pendientes".
- **Throttles.** Every Resend call now retries a "too many requests" answer once, after at most two seconds, which also protects the outboxes and the emails sent inline; the notification worker no longer spends an attempt on one.
- **Push**, only when ticked: the title and "Tocá para ver el detalle.": the text itself never sits on a lock screen. A participant gets it only once `notifications` and `push_notifications` are public for them.
- **Unsubscribe headers** go on every comunicado email, except an essential one to someone who already unsubscribed from Anuncios, where a one-click press would silently do nothing; their footer explains the exception instead.
- **Staging mail is marked:** "[Prev]" before the subject, "Productora Glitter (prueba)" as the sender, and a footer line saying it came from the test environment.

### Scheduling

- **States:** Borrador → Programado → Enviado, with "Cambiar fecha", "Cancelar programación" and "Enviar ahora". A scheduled comunicado is read-only; to change its text or recipients, cancel the schedule first.
- **Time** is picked in Bolivia's time (La Paz) and always shown afterwards: "Programado para el sábado 31 de octubre, 09:00 (hora de Bolivia)". In production its send starts within a minute of that time, and the emails take two or three minutes more; on previews it waits until someone presses "Procesar envíos pendientes".
- **Not sent** when more than an hour late (default 16), or when the send is refused at that moment (too many recipients, nobody eligible, a filter or the content no longer valid, no longer allowed to be essential, its scheduler no longer an admin). It goes back to draft with the reason shown, and "No se envió «…»" lands in the bell.
- **Overdue.** Three minutes past its time, a comunicado still waiting says "Debería haber salido el sáb 31 oct, 09:00 y todavía no salió." with "Enviar ahora", so a broken cron shows in production too.

### Editing and retracting

- **Editing** (on a page of its own, no autosave) saves a new version and rewrites every inbox item, marked "· Editado" in the list and "Editado el 25 de octubre, 10:12" on its page; an open inbox shows it the next time it loads. An item written after the edit shows the new text, unmarked. An email that may already have reached Resend keeps what landed. Pending pushes carry the new title; delivered ones keep the old, and an iPhone may still show the old title once in its arrival toast. The page keeps the history: "Versión 2 · editada por Ana el 25 oct., 10:12 · «Cambió el horario de armado»". Editing an essential comunicado requires a note saying why.
- **Retracting** requires a reason, seen only by the team. The items disappear from every inbox, also for people who read them, and the archive toast's "Deshacer" cannot bring them back; a link or a push tap to one lands in the inbox. Emails and pushes not sent yet are cancelled. The comunicado, its versions and its report stay in the dashboard, and "Duplicar" is the usual fix: retract, duplicate, correct, send.
- **What neither can undo:** emails already sent, pushes already delivered (only the title and "Tocá para ver el detalle."), and images in sent mail (only deleting the file recalls them, default 21). The dialogs say so.

### The comunicado's page

- **Header:** who sent it and when, edits, the essential record when there is one, and the audience as it was at send ("Confirmados · Glitter Navidad 2026: 312 · Ilustradores: 845 · 3 personas por nombre").
- **Figures:** recipients, read in the app, emails sent, emails not sent (by reason), bounces and spam reports from this comunicado, devices reached, still queued.
- **Recipients,** 50 per page, filterable (no leídos, correo no enviado, omitidos, con error) and searchable by name or email. Each row shows how the person was added (list, by name, or "Admin de prueba" on a preview), the app state, the email state with its reason, and devices.
- **While it sends** the page refreshes itself and says how far along it is. Banners say when it stopped: Resend refused the key or the sender, the monthly allowance ran out, or nothing moved in 10 minutes.
- **"Reintentar fallidos (N)"** queues the failed emails and recipients again with the current text, never an email that may have arrived. **"Duplicar"** makes a new draft with the same text, button, email setting and recipients, never the push, the essential mark or the schedule.

### What participants see

- **Inbox:** the megaphone tile, the title, two lines of the text, "· Editado" when edited. The Anuncios chip appears as soon as a person has an anuncio and never shows empty.
- **Item page:** the formatted text, "Editado el …" when edited, and the button.
- **Email:** from "Productora Glitter", "¡Hola Ana!", the title, the text, the button, and a footer with "¿No querés recibir más correos como este? Darme de baja". An essential one adds: "Es un correo esencial sobre tu participación en {festival}: llega también a quienes se dieron de baja de los anuncios."
- **Unsubscribing** from Anuncios is email only; anuncios keep landing in the app. For that topic the page adds: "Seguirás recibiendo los correos que vos pidas, como tus entradas o reservas, y los correos esenciales sobre los festivales donde tenés un espacio confirmado, como un cambio en el horario de armado. Los anuncios seguirán apareciendo en tus notificaciones de Glitter."

### Admin area and access

- **Comunicaciones** (`/dashboard/communications`), in the admin menu next to Créditos: Comunicados · Listas · Regalos de créditos (the gifts pages, as §6 promised).
- **Every page** checks a global admin and the flag (default 14); **every action** checks both before anything else. The dashboard layout lets festival admins in, so each page checks again.
- **The flag hides the admin side and stops nothing.** Taking an admin off it while sends are scheduled or in progress leaves them going: scheduled comunicados still go out and sends in progress finish. Cancel or retract first, while the area is still visible, or target yourself on the flag again; otherwise only the database hold in the implementation doc stops their emails.

### Data

- New tables: `comunicados` (the draft, its schedule, channels, recipients as chosen, the essential record, retraction, and the audience as it was at send), `comunicado_revisions` (each version's title, blocks and rendered text, never changed), `distribution_lists` and `distribution_list_members`.
- Reused: `notification_campaigns` (a `comunicado` type, one per sent comunicado) and `notification_campaign_recipients` (one row per person, with how they were added).
- `notifications` gains `edited_at` and `retracted_at` (a retracted item is always archived); `notification_deliveries` gains a `lane` and the batch columns. New email topic `announcements`.
- Migrations `0301`, `0302` and `0303`, one per schema PR. A production release may apply all three in one transaction; the implementation doc's migration rule keeps that safe, and a test enforces it.

### Launch and rollback

1. The sending groundwork (PR 2) reaches production alone and goes through at least one real credit gift first, because it changes how every email is picked and retried.
2. `notifications` goes public before the first real comunicado, and `push_notifications` before ticking push means anything.
3. The other PRs land behind the hidden flag, each checked on a preview.
4. First real sends, in steps: to an admin's own participant account by name; a fixed list of about 20 trusted participants; a recent festival's Confirmados; then up to 2,000. Don't go to the next step while bounces exceed 2% or spam reports 0.1% (proposed, until Resend's thresholds for the account are known). Check that SPF, DKIM and DMARC align in Resend before the third step.
5. The first gift from a list goes to a fixed list of two or three trusted participants.

Hiding the flag is always safe for the data, but it stops nothing (Admin area). The migrations are fixed forward. The lane filters are never reverted while comunicado emails or pushes are queued: old code would pull them into the gift queue, where their emails would fail and their pushes would jump the line. If a revert is unavoidable, the implementation doc has the statement that skips them first.

### PRs

1. This design: §12 and the implementation doc.
2. Sending groundwork: the email lane and its batch protocol, the throttle retry, the Anuncios topic, the retraction columns. Migration `0301`. Nothing sends comunicados yet; the throttle retry applies to every Glitter email from its deploy on.
3. Distribution lists, the gift picker's "Agregar una lista", the `comunicados` flag and the Comunicaciones area. Migration `0302`.
4. Writing comunicados: the text format, the three renderings, the composer and its previews, the test send. Migration `0303`. Nothing can be sent to recipients yet.
5. Sending, the report, retracting, essential sends and the cron.
6. Scheduling, "Reintentar fallidos" and "Duplicar".
7. Editing after sending.
8. Images (default 21).

### Still to check

- How many verified and paused participants there are today: an "all participants" list may already pass 3,000.
- Whether the shared staging database holds real participants' addresses, since people picked by name on a preview get real email.
- Glitter's monthly email volume outside comunicados, the account's request limit (both on Resend → Settings → Usage), and Resend's bounce and spam thresholds for the account.
