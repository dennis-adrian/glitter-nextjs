# PRD: Paid Programs and Sessions

**Product:** Glitter

**Date:** 2026-07-24

**Status:** Proposed for technical definition

**Initial launch:** Glitter Week, linked to the August Glitter Festival

**Implementation roadmap:** [ROADMAP-paid-programs-and-sessions.md](./ROADMAP-paid-programs-and-sessions.md)

---

## 1. Executive summary

Glitter will add a first-class **paid programs and sessions** capability for organizing talks, workshops, and, in the future, other content-focused gatherings. This capability will remain separate from the current festival, exhibitor, booth, and reservation system.

The first use will be **Glitter Week**, a curated program linked to the August Glitter Festival. However, a program may exist without an associated festival. Sessions may be sold individually or through a **Week Pass** that includes every session in the program.

The MVP will conceptually reuse existing order, voucher, email, QR code, and check-in patterns, but it will require neutral program, session, purchase, ticket, and attendance models. Talks and workshops will **not** be added as `festivalType` values.

## 2. Goals and scope

### 2.1 Goals

- Publish thematic programs composed of purchasable sessions.
- Sell one or more sessions through a single checkout with one combined payment total.
- Offer differentiated pricing for active participants and the general public.
- Control capacity, temporary seat reservations, vouchers, ticket issuance, and attendance per session.
- Support an all-access pass and upgrades from an individual ticket.
- Give the admin team full control over content, sales, payments, support, waitlists, and check-in.
- Keep the architecture ready for programs that are independent of a festival.

### 2.2 Initial scope

- Session types: **Charla (Talk)** and **Taller (Hands-on Workshop)**.
- Glitter Week as the first program.
- Public and active-participant prices for each session and the Week Pass.
- Manual bank QR payment with voucher upload.
- Free registration with capacity enforcement.
- Guests, ineligible users, and active participants.
- QR tickets and session-specific check-in.
- Manually managed waitlists.
- Cancellations governed by the rules in this document.

## 3. Users and permissions

### 3.1 Glitter admin

Current administrative roles retain their access in the MVP. The admin team:

- Creates and edits programs, sessions, dates, venues, and public speaker profiles.
- Defines audience, prices, capacity, sales windows, and publication.
- Reviews vouchers and performs support actions.
- Manages cancellations, rescheduling, waitlists, and check-in.
- Reviews operational metrics per session.

A limited check-in operator role will not be created in the MVP.

### 3.2 Active participant

An active participant is a signed-in user who meets Glitter's current active-participant criteria. They may:

- Access sessions whose audience includes active participants.
- Receive the active-participant price.
- Review purchases, vouchers, and tickets in a dedicated profile area.

Paused, banned, or inactive accounts are ineligible. They are treated as members of the general public for both access and pricing.

### 3.3 Public user or guest

This group includes:

- People without an account.
- Signed-in users who are not active participants.
- Users with paused, banned, or inactive accounts.

They access purchases, payments, and tickets through a secure link sent by email. The link follows the existing secure guest-order access pattern.

### 3.4 Speaker or facilitator

A speaker or facilitator does not need a Glitter account. An admin creates and maintains their public profile. A session may have one or more speakers or facilitators.

## 4. Functional model

### 4.1 Program

A program groups sessions under a shared editorial proposal. It must support:

- Name, summary, visual content, and overall date range.
- Default venue.
- Optional link to a festival.
- Bulk publication of its sessions.
- Optional Week Pass.
- Optional pass benefits.
- Global default active-participant pricing or discount rule.

A festival relationship adds context and benefits, but does not turn the program into a festival or make it dependent on sectors, booths, or exhibitors.

### 4.2 Session and occurrence

A session represents purchasable content. Its initial types are:

- **Charla (Talk):** a presentation or discussion led by one or more speakers.
- **Taller (Hands-on Workshop):** a practical experience led by one or more facilitators.

A repeat group created in response to demand must be a separate **scheduled occurrence**, with its own time, capacity, tickets, and sales. It does not share inventory with the original group.

The initial default capacity is **20 people per occurrence**, adjustable by admins.

### 4.3 Speaker or facilitator

The admin-managed public profile must support, at minimum:

- Public name.
- Image.
- Short biography.
- Optional public links.
- Many speakers associated with one session and one speaker associated with many sessions.

## 5. Content and publication

### 5.1 Public session content

Each public session page must display:

- Title.
- Type: Charla or Taller.
- Speaker(s) or facilitator(s).
- Date and time.
- Capacity or availability.
- Public price.
- Active-participant price.
- Venue, location, and room.
- Topic.
- Short description.
- Learning outcomes or key takeaways.
- Optional skill level.
- Image or banner.
- Sales status and applicable call to action.

Materials and prerequisites are outside the MVP.

### 5.2 Venues

- The program defines a default venue.
- Each session or occurrence may override it with another venue, location, or room.
- The effective session location is the session override when present; otherwise, it is the program venue.

### 5.3 Discovery and shareable pages

- The program has a public page containing all of its sessions.
- Each session has a public page and shareable URL.
- A published session may be shared even when other sessions in the program remain in draft.
- An admin may publish sessions individually or publish all eligible sessions in the program in one action.

## 6. Audience, eligibility, and pricing

### 6.1 Audience modes

An admin selects one mode per session:

1. **Active participants and guests.**
2. **Active participants only.**
3. **Guests or general public only.**

The server must validate audience mode when the purchase starts and again when it is confirmed. An ineligible signed-in user is treated as a member of the general public.

### 6.2 Prices

Each session and the Week Pass have:

- Public price.
- Active-participant price.

Rules:

- A global default active-participant pricing or discount rule exists.
- A session or pass may override the default.
- The applicable price is calculated using the buyer's current eligibility.
- The applied price and eligibility basis are preserved with the purchase for audit purposes.
- A price may be zero.

### 6.3 Free sessions

A free session:

- Registers one person per ticket.
- Reserves capacity immediately.
- Issues and sends the QR immediately.
- Does not create a payment step or require a voucher.
- Follows the same audience, cancellation, waitlist, and check-in rules.

## 7. Cart, Week Pass, and upgrades

### 7.1 Purchasing individual sessions

- A buyer may add multiple individual sessions to the same cart.
- Checkout produces one combined total and one voucher for the entire purchase.
- Capacity for every line is reserved together.
- After approval, one distinct QR is issued per person and session.
- A person cannot buy more than one ticket for themselves in the same occurrence.

### 7.2 Week Pass

At launch, the Week Pass:

- Includes every current session in the program.
- Reserves one seat in every included session.
- Has a public price and an active-participant price.
- May include the optional **Festival Fast Pass** benefit for every date of the linked festival, initially August 15 and 16.

Festival Fast Pass will be modeled as an optional pass benefit, but bracelet issuance, festival operations, and separate Fast Pass sales are outside the MVP.

If the cart contains every included individual session, Glitter must recommend the Week Pass and show the corresponding savings. Replacing the sessions requires buyer confirmation.

### 7.3 Upgrading to a Week Pass

The holder of an individual ticket may initiate an upgrade:

- Their existing seat is preserved.
- They pay only the difference between the amount already paid and the applicable Week Pass price.
- The upgrade proceeds only if every remaining included session has capacity.
- Capacity verification and reservation for the remaining sessions must be atomic.
- Newly reserved seats follow the standard hold and voucher rules.
- The Week Pass and additional tickets are confirmed only after the difference payment is approved; the original ticket remains valid during the process.

## 8. Capacity and waitlist

### 8.1 Capacity

- Initial default capacity: 20 per occurrence.
- Each ticket belongs to one person.
- A Week Pass consumes one seat in every included session.
- A multi-item purchase may proceed only if all lines have availability.
- Validation and reservation must prevent overselling under concurrency.
- Tickets cannot be transferred in the MVP.

### 8.2 Waitlist

Each sold-out occurrence has its own waitlist.

Rules:

- A buyer joins the waitlist for the specific occurrence.
- Waitlist growth triggers an operational notification to the team.
- When a seat becomes available, the admin team is notified.
- There is no automatic promotion and no requirement to invite in arrival order.
- An admin manually chooses any person from the list and sends them a purchase invitation.
- The invitation must be traceable and define a purchase window; its exact duration is an implementation configuration.
- If the person does not complete the purchase during the window, the seat may return to general availability or be offered to someone else.

## 9. Checkout, seat holds, and vouchers

### 9.1 Initial hold

When checkout is confirmed:

- Every seat in the cart is held for **20 minutes**.
- The page displays the deadline and total due.
- If no voucher is uploaded, the hold expires and all seats are released.
- If a voucher is uploaded within the deadline, the seats remain reserved during verification with no subsequent automatic expiration.

### 9.2 Vouchers

- Payment follows Glitter's current manual style: bank QR and image upload.
- The buyer may replace the voucher at any time before approval.
- The newest version is presented for review.
- All previous versions remain available for audit.
- “Changes requested” communicates the problem and allows voucher replacement; it does not add another gate.
- After approval, the voucher is locked.
- Access QR codes are issued only after approval.

### 9.3 Support actions

The admin team may:

- Complete or adjust a purchase.
- Upload or replace a voucher.
- Request changes.
- Approve or reject the payment.
- Cancel the purchase.
- Resend the secure link, confirmations, and tickets.

Every action records the admin, date, reason, and change performed.

## 10. States and transitions

### 10.1 Program or session

| State          | Meaning and primary rules                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `draft`        | Not visible or purchasable.                                                                          |
| `published`    | Publicly visible; purchasable only within the configured sales window.                               |
| `sales_closed` | Visible, but does not accept new purchases. May be reached manually or when the sales window closes. |
| `completed`    | The session has occurred and retains its history, tickets, and attendance.                           |
| `cancelled`    | Cancelled by Glitter; stops sales and starts refund handling.                                        |
| `rescheduled`  | The date or time changed; the ticket remains valid and the holder may request a refund.              |

Sales opening and closing are configured with dates and times, separate from editorial status. Publishing a program performs a bulk action on its eligible sessions without overwriting sessions that are cancelled, completed, or awaiting required validation.

### 10.2 Purchase and voucher

| Conceptual state     | Entry condition                       | Allowed outcomes                                                   |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `pending_upload`     | Seats held when checkout is confirmed | `expired`, `under_verification`, `cancelled`                       |
| `expired`            | No voucher uploaded within 20 minutes | Terminal state; releases seats                                     |
| `under_verification` | Voucher uploaded or replaced          | `changes_requested`, `approved`, `rejected`, `cancelled`           |
| `changes_requested`  | Admin communicated a problem          | Replacement → `under_verification`; also `cancelled` or `rejected` |
| `approved`           | Admin confirmed payment               | Issues tickets; locks voucher                                      |
| `rejected`           | Admin closed payment without approval | Releases seats and does not issue tickets                          |
| `cancelled`          | Buyer or admin cancelled under policy | Releases seats; preserves audit history                            |

Final technical state names may differ, but their behavior must not. A free purchase moves directly to `approved` without a voucher.

### 10.3 Ticket and attendance

- A ticket is issued only for an approved purchase or free registration.
- A ticket is valid for one person and one occurrence.
- Check-in creates an attendance record with time and operator.
- A second scan does not create another attendance record and shows that the ticket was already used.
- Cancelling a purchase invalidates its unused tickets and releases the corresponding seats.

## 11. Attendee access and communications

### 11.1 Secure access

Public users, guests, and ineligible users receive a secure link by email to:

- Review the upload deadline.
- Upload or replace the voucher before approval.
- Review payment status.
- View and recover their QR codes after approval.
- Cancel when policy permits.

After voucher upload, the confirmation page also displays the secure link so the buyer can save it.

Active participants review purchases, vouchers, and tickets from a dedicated profile section, in addition to receiving the applicable emails.

### 11.2 Attendee emails

- Voucher submitted and seats reserved.
- Changes requested.
- Payment approved, with secure link and QR code per session.
- Cancellation confirmation and reminder that no refund is due.
- Cancellation or rescheduling by Glitter, with refund instructions when applicable.

### 11.3 Admin notifications

- New voucher awaiting review.
- Ticket cancellation.
- Waitlist growth.
- Seat released while a waitlist is active.

Transactional emails will use Resend and follow best practices for domain authentication, consistent senders, clear content, retries, and idempotency. Glitter cannot guarantee placement in the primary inbox by every provider; the secure link shown on the confirmation page serves as a fallback.

## 12. Cancellations and refunds

### 12.1 Attendee cancellation

- Cancellation is allowed until **two days before** the session starts.
- It does not generate a refund.
- Checkout requires an explicit checkbox acknowledging the policy.
- The policy version, date, identity or secure link, and acceptance are recorded.
- Cancellation invalidates the ticket, releases the seat, and notifies the team when a waitlist exists.
- Transfers are not permitted.

For multi-session purchases or a Week Pass, the UI must clearly state what is being cancelled. The exact definition of partial Week Pass cancellation must be finalized before implementation; it must never trigger an automatic refund for attendee-initiated cancellation.

### 12.2 Cancellation or rescheduling by Glitter

- If Glitter cancels a session, a refund is due.
- If Glitter reschedules a session, the ticket remains valid.
- After rescheduling, the attendee may request a refund.
- Refund requests and resolutions are audited; automated bank refunds are outside the MVP.

## 13. Admin dashboard

For each session or occurrence, the dashboard must show, in near real time:

- Tickets sold or confirmed.
- Held seats and remaining seats.
- Payments awaiting review.
- Waitlist size.
- Completed check-ins.

It must also support:

- Filtering purchases by status.
- Opening voucher history.
- Reviewing administrative action history.
- Downloading or reviewing the attendee list.
- Scanning or manually entering a ticket code.
- Publishing, closing sales, cancelling, rescheduling, and completing sessions.
- Performing support and resend actions.

## 14. Audit requirements and critical rules

- Every sensitive mutation is validated on the server.
- Eligibility, audience, price, and capacity are recalculated when checkout is confirmed.
- Holds, multi-item purchases, Week Passes, and upgrades are atomic with respect to inventory.
- Every voucher version is immutable and traceable.
- Every sensitive admin action requires a reason.
- No-refund policy acceptance is preserved with version and date.
- Secure links are opaque and revocable, and do not expose enough information to be guessed.
- Ticket and email issuance must be idempotent.
- Ticket validity is separate from the check-in record.

## 15. Reuse and architecture

### 15.1 Conceptually reusable

- Guest-order and secure-link pattern.
- Bank QR, voucher upload, and review queue.
- Resend infrastructure and transactional templates.
- QR/barcode generation and check-in UI.
- Reminder, expiration, and audit patterns.
- Capacity and waitlist concepts from festival activities.

### 15.2 Required separation

New models must be neutral and must not depend on:

- `festivalType`.
- Exhibitor sectors, booths, or reservations.
- `festivalActivities` and their gamification types.
- Existing free tickets linked directly to `festivalId`.
- Booth reservation invoices.

The expected technical design includes separate concepts for program, session, occurrence, speaker, audience/pricing, pass, benefit, seat hold, purchase, voucher versions, ticket, and check-in. A festival association must be optional.

## 16. MVP and out of scope

### Included in the MVP

- Glitter Week and standalone programs.
- Talks and workshops with multiple speakers.
- Individual sessions and Week Pass.
- Multi-session cart with one voucher.
- Eligibility-based pricing and free sessions.
- Twenty-minute holds.
- Manual voucher review with history.
- Per-session QR codes, check-in, and duplicate prevention.
- Waitlist with manual invitations.
- Secure email access and active-participant profile area.
- Cancellation, rescheduling, and admin support under these rules.

### Out of scope

- Operational implementation of Festival Fast Pass or bracelets.
- Separate Fast Pass sales.
- Ticket transfer or resale.
- Online payment or automated bank refunds.
- Selecting only some sessions within a Week Pass.
- Workshop materials and prerequisites.
- Limited check-in roles.
- Automatic waitlist promotion.
- Mandatory speaker accounts.

## 17. Open implementation notes

- Define the canonical and efficient source for “active participant”; evaluate it on the server and preserve it as pricing evidence.
- Define final entity and state names without reusing festival or store semantics that do not apply.
- Design transactional seat locking or reservation to prevent overselling and double release.
- Define how rescheduling is represented: schedule history, a new occurrence, or a version, while preserving ticket validity and traceability.
- Define the configurable duration of waitlist invitations.
- Finalize the partial-cancellation UX for multi-session purchases and the permitted scope for a Week Pass.
- Model Festival Fast Pass as an extensible benefit even though fulfillment is disabled in the MVP.
- Extract shared voucher, email, and QR services where useful; do not use store products as the permanent representation of tickets.
