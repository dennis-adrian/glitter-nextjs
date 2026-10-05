# Bulk email: unsubscribes, bounces and complaints

Who a bulk mailing skips, and how that list fills itself. A bulk mailing is
one we send to a whole list at once (today: the two festival invitations in
`app/lib/festivals/invitations.ts`). An unsubscribe never affects single
emails a person triggers themselves (their ticket, a reservation, a
payment). A bounce or spam complaint does, but not through this app: Resend
keeps such addresses on its account-wide suppression list and delivers
nothing to them, transactional mail included, until they are unblocked.

## What is skipped

| Table | Filled by | Effect |
|---|---|---|
| `email_suppressions` | Resend webhook: permanent bounces, spam complaints, Resend's own suppressions | No bulk mail at all to that address |
| `email_unsubscribes` | The "Darme de baja" link in the email, the inbox's own unsubscribe button, or an admin on `/dashboard/emails` | No bulk mail of that **topic** (or, for `all`, of any topic) to that address |

Both are keyed by `lower(trim(address))`, so they cover every case variant of
an address, both the `visitors` and `users` tables, and survive a deleted
profile.

- Transient bounces (full mailbox, greylisting) are ignored, so the next
  mailing tries again.
- Webhooks repeat and arrive out of order, so each row keeps the time of the
  newest Resend event applied to it (`last_event_at`, from the event's
  `created_at`, which retries keep). An older event never overrides a newer
  one, and a complaint outranks a bounce whichever arrives first.
- When Resend lifts a suppression, the row is kept with `lifted_at` set
  rather than deleted, so a late retry of the bounce it lifted is ignored.
  Only active rows (`lifted_at is null`) block mail.
- The invitation dialog shows how many people are skipped and why.

Topics (`email_topic` enum, labels in `app/lib/emails/topics.ts`):

- `visitor_invitations`: visitors invited when acreditación opens.
- `participant_invitations`: participants told a festival is open.

## Unsubscribing

Every bulk email carries:

- a footer link to `/email/unsubscribe?token=…`, a page that asks before
  unsubscribing (link scanners open every link) and offers to undo it. For
  someone an admin unsubscribed from all bulk mail, the page says "todos
  nuestros correos masivos", and undoing it there lifts that; otherwise a
  link only ever changes its own topic;
- `List-Unsubscribe: <https://…/api/email/unsubscribe?token=…>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). Gmail, Yahoo
  and others show their own "Unsubscribe" button and POST there; it takes
  effect at once, with no page.

The token (`app/lib/emails/unsubscribe-tokens.ts`) names the visitor or user
row and the topic, signed with a key derived from `CLERK_SECRET_KEY`. It
carries no address, never expires, and is the same every time, so a retried
batch keeps its idempotency key. **Rotating `CLERK_SECRET_KEY` breaks the
links in emails already sent**; the page then points people to support.

## Bounces and complaints: Resend webhook

`POST /api/webhooks/resend` (`app/api/webhooks/resend/route.ts`) verifies the
Svix signature by hand (`app/lib/emails/resend-webhook.ts`, written before the
SDK had a helper; `resend` 6.x's `resend.webhooks.verify` checks the same
signature), then records or lifts suppressions. It answers 500 on a database error so Resend retries,
and 500 when the secret is not set (an empty value counts as not set).

The unsubscribe page tells people whose address is suppressed that bulk mail
stays blocked, instead of offering to resubscribe them.

Setup, once per environment that should receive events:

1. Resend dashboard → Webhooks → Add endpoint:
   `https://www.glitter.com.bo/api/webhooks/resend`.
2. Events: `email.bounced`, `email.complained`, `email.suppressed`,
   `suppression.added` and `suppression.removed`. The last one is what lets
   an address removed from Resend's suppression list be mailed again here
   too. The admin page below is the other way to lift one.
3. Copy the signing secret (`whsec_…`) into the environment as
   `RESEND_WEBHOOK_SECRET`, then redeploy.

Resend already refuses to deliver to addresses on its own suppression list and
reports each refused send as `email.suppressed`, so the old undeliverable
addresses in the visitor list are recorded here the next time an invitation
goes out, and skipped after that.

## Admin page: `/dashboard/emails`

"Correos bloqueados", in the admin Dashboard menu. Admins only: festival
admins send the invitations but do not decide who receives them.

- **Bloqueados**: active suppressions, with the bounce message and whose
  address it is. "Desbloquear" lifts it here (recording the admin) and asks
  Resend to remove it from its own list (`DELETE /suppressions/{email}`,
  everywhere but local development; that list is account-wide, so
  unblocking from staging also unblocks the address for production). If Resend
  refuses, for example because its suppressions API is not enabled for the
  account, the page says so: remove it in Resend → Suppressions, or the next
  mailing blocks it again.
- **Bajas**: unsubscribes by topic, and who added each one. "Quitar baja"
  removes exactly that row, and says so when another one still keeps the
  mail from going out. "Dar de baja un correo" adds one for someone who
  asked by other means; "Todos los correos masivos" uses the `all` topic,
  which also covers topics added later.
- **Desbloqueados**: lifted suppressions, and whether an admin or Resend
  lifted them.

Search matches the address or the name of the visitor or participant it
belongs to.

## Adding a topic (newsletter, merch promotions)

1. Add the value to `emailTopicEnum` in `db/schema.ts` and generate a
   migration (`pnpm generate --name …`). A new enum label cannot be used in
   the same transaction that adds it; see `scripts/migrate.ts`.
2. Add its labels to `EMAIL_TOPIC_LABELS` and `EMAIL_TOPIC_SHORT_LABELS`.
   People unsubscribed from `all` are skipped automatically.
3. When building each email: `unsubscribeLinks(recipient, topic)` gives the
   `headers` and the footer `pageUrl` (pass it to `EmailFooter`).
4. When choosing recipients: filter with
   `reachableByBulkMail(sql\`${table.email}\`, topic)`, and count with
   `bulkMailExclusion` if the admin sees a count first.

## Testing locally

- Unit: `pnpm exec vitest run app/lib/emails`.
- Database: `app/lib/emails/suppressions.integration.test.ts` (part of
  `pnpm test:integration`) covers the rules, the webhook with signed requests,
  the one-click endpoint and the page actions.
- By hand: run the dev server with any `RESEND_WEBHOOK_SECRET=whsec_<base64>`
  and POST an event signed with it (`svix-id`, `svix-timestamp`,
  `svix-signature: v1,<base64 HMAC-SHA256 of "id.timestamp.body">`).
