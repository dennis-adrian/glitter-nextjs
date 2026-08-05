# Implementation Roadmap: Paid Programs and Sessions

**Product:** Glitter

**Date:** 2026-07-24

**Reference PRD:** [PRD-paid-programs-and-sessions.md](./PRD-paid-programs-and-sessions.md)

**Status:** In progress — Phases 0–3 delivered; Phase 4 deferred (§0a); Phase 5 in progress

---

## 0a. Scope change — multi-session cart deferred (2026-07-30)

The **multi-session cart is out of the MVP.** Buyers sign up for one session at a time, from that session's page. There is no cart, no multi-select, and no combined checkout.

**Why:** the cart only saves a buyer a second trip through a form they are already on. Every rule it needs — atomic multi-line holds, combined totals, one voucher for several seats — is inventory and money logic that has to be right the first time, and none of it buys anything the per-session flow does not already deliver.

**What this leaves:** Phase 3's single-session paid purchase _is_ the paid flow. Phase 4 has no remaining MVP scope, so the sequence runs Phase 3 → Phase 5.

**As-built note.** `startPaidCheckout` already accepts an array of occurrences and writes one line per entry, verified against the database. That capability is kept rather than reverted: the single-occurrence path is the same code, and removing it would mean re-deriving atomic multi-line locking when the cart returns. It is unreachable from the UI, which submits exactly one occurrence. The same applies to the voucher acknowledgement email, which renders every line and today always renders one.

Deferred items are marked **[Deferred — post-MVP]** in place rather than deleted.

---

## 0b. Scope change — Week Pass deferred (2026-07-29)

The Week Pass, its benefits, its single QR, the cart recommendation, and the upgrade flow are **cut from the MVP** to protect the launch date. See [PRD §0b](./PRD-paid-programs-and-sessions.md) for the full rationale.

Effect on this roadmap:

- **Phase 4 was reduced to "Multi-session cart" only** — and §0a has since deferred that too, leaving Phase 4 with no MVP scope.
- Pass, benefit, and upgrade deliverables move to §4 Post-MVP.
- Two Phase 6 concurrency cases (pass vs. individual sale) and one Phase 5 check-in case (pass scanned per session) fall away with them.

Deferred items are marked **[Deferred — post-MVP]** in place rather than deleted.

---

## 1. Approach

This roadmap divides implementation into **dependency and risk phases**, not calendar estimates.
Phases 0, 1, 2, 3, 5, and 6 make up the complete MVP; Phase 4 is deferred in full (§0a) and the
sequence runs Phase 3 → Phase 5. A phase may be delivered through several internal increments, but
public sales must not be enabled until Phase 6 is complete.

Sequencing principles:

- Establish the neutral domain and content administration first.
- Validate identity, audience, pricing, capacity, and tickets through free sessions before introducing money.
- Implement and harden single-session paid purchases. The multi-session cart that would have followed is deferred (§0a).
- Add operations, cancellations, and check-in before the public pilot.
- Keep new models separate from festivals, booths, festival activities, and store products.

```text
Phase 0: contracts and architecture          ✅ delivered
  → Phase 1: catalog and publication         ✅ delivered
    → Phase 2: end-to-end free admission     ✅ delivered
      → Phase 3: single-session payment      ✅ delivered
        → Phase 4: multi-session cart        ⏸ deferred (§0a)
          → Phase 5: event operations
            → Phase 6: hardening, pilot, and launch
```

## 2. MVP phases

### Phase 0 — Product contracts and architecture

**Objective:** eliminate high-impact ambiguity before creating data or financial workflows.

**Deliverables**

- Glossary and conceptual model for:
  - Program, session, occurrence, speaker, venue, and optional festival link.
  - Audience, public price, active-participant price, and default rules.
  - Seat hold, purchase, purchase line, and ticket. Pass and benefit are modeled but not built (§0b).
  - Voucher versions, check-in, waitlist, and audit history.
- Relationship diagram and boundaries with current domains.
- State and transition contracts for publication, sales, purchases, vouchers, tickets, and attendance.
- Canonical, queryable definition of “active participant.”
- Strategy for:
  - Concurrency and inventory.
  - Idempotency.
  - Secure access tokens.
  - Administrative audit history.
  - Hold expiration.
  - Feature-flagged rollout.
- Permission matrix that retains current administrative roles.

**Acceptance criteria**

- Charla and Taller are not modeled as `festivalType`.
- A program may exist with or without a related festival.
- No new entity requires an exhibitor sector, booth, reservation, or festival activity.
- A single source is documented for active-participant eligibility and pricing.
- Capacity invariants are approved: no overselling, no double release, and atomic multi-session purchases.
- States, invalid transitions, and authorized actors are defined before mutations are implemented.
- The strategy does not require migrating or reinterpreting existing free festival tickets or booth invoices to launch the MVP.

### Phase 1 — Catalog, administration, and publication

**Objective:** allow Glitter to build and publish Glitter Week content without enabling sales yet.

**Deliverables**

- Administration of programs, sessions, occurrences, speakers, and venues.
- Initial Charla and Taller types, with multiple speakers per session.
- Program default venue with session or occurrence overrides.
- Complete public content:
  - Title, topic, description, learning outcomes, optional level, and image.
  - Date/time, location, capacity, and prices.
- Optional link between the program and the August Glitter Festival.
- `draft`, `published`, `sales_closed`, `completed`, `cancelled`, and `rescheduled` states.
- Admin-controlled sales opening and closing windows.
- Individual publication and bulk program publication.
- Shareable public program and session pages.

**Acceptance criteria**

- An admin can create Glitter Week linked to the festival and another program without a festival.
- A duplicate occurrence has its own schedule, capacity, and inventory.
- A speaker without an account can appear in one or more sessions.
- Effective location uses the session override when present and the program venue otherwise.
- A draft session is not publicly visible.
- Bulk publication does not modify cancelled, completed, or invalid sessions.
- A published session displays its sales status and does not allow purchases outside its configured window.

### Phase 2 — Identity, eligibility, and free admission

**Objective:** validate the audience, capacity, identity, and ticket core through a workflow without financial risk.

**Deliverables**

- Server-side evaluation of the three audience modes:
  - Active participants and guests.
  - Active participants only.
  - Guests or general public only.
- Applicable-price engine and eligibility snapshot.
- Registration for guests/public users and active participants.
- Secure guest access and an initial purchase/ticket area in the active participant's profile.
- Atomic capacity reservation for free sessions.
- One named ticket per person and occurrence.
- Immediate QR issuance, email, and recovery page for free registrations.
- Neutral ticket and attendance foundations that do not depend on the current festival ticket.

**Acceptance criteria**

- An active participant receives the appropriate access and price.
- An ineligible signed-in user behaves as a member of the general public.
- Paused, banned, or inactive accounts do not receive active-participant access or pricing.
- A free session does not request a voucher and issues the QR immediately.
- Two concurrent requests for the final seat cannot confirm two tickets.
- The same attendee cannot register twice for the same occurrence.
- A guest recovers their ticket only through an unguessable secure link.
- An active participant sees the ticket in their profile.

### Phase 3 — Paid single-session purchase

**Objective:** complete the first financial journey with one session before composing more complex purchases.

**Deliverables**

- Single-session checkout with public or active-participant pricing.
- Versioned acceptance of the no-refund policy.
- Twenty-minute seat hold.
- Secure page with bank QR, total, deadline, and voucher upload.
- Automatic expiration and seat release when no voucher is uploaded.
- Immutable, auditable voucher versions.
- States:
  - Pending upload.
  - Under verification.
  - Changes requested.
  - Approved.
  - Rejected, expired, or cancelled.
- Admin review of the newest voucher.
- Voucher replacement before approval.
- Ticket issuance and delivery only after approval.
- Minimum admin actions: upload/replace, request changes, approve, reject, cancel, and resend.
- Emails for seat reservation/voucher receipt, changes requested, and approval with QR.

**Acceptance criteria**

- Without a voucher at minute 20, the seat is released exactly once and no ticket is issued.
- A voucher uploaded on time keeps the seat without automatic expiration during review.
- “Changes requested” does not block voucher replacement.
- The team reviews the newest version and retains access to prior history.
- After approval, the voucher is locked and QR issuance is idempotent.
- Rejection or cancellation releases the seat and invalidates any non-current access.
- A guest can review status and recover the QR through their secure link.
- An active participant can do so from their profile.
- Every admin action records actor, date, and reason.

### Phase 3.1 — Program referral promo codes

**Status:** implemented behind the existing `paid_programs` flag.

**Delivered**

- Program-scoped percentage codes with referral-partner attribution, validity windows, activation,
  optional maximum uses, and admin audit history.
- Promo pricing from public base, never stacked with participant/program discounts, floored to
  whole bolivianos per line.
- Buyer preview and responsive decision drawer when applying a promo would increase the existing
  price.
- Checkout-time code locking, usage-limit validation, explicit higher-price acceptance, immutable
  redemption snapshots, and zero-total immediate ticket issuance.
- Admin list/detail views with confirmed, in-progress, and released usage plus attributed amounts.
- Promo attribution in buyer purchase summaries, admin review, and occurrence roster.

**Validation**

- Public Bs 70, existing Bs 56, promo 50% resolves to Bs 35.
- A worse promo cannot be submitted without explicit acceptance.
- Concurrent limited-code checkouts serialize on the code row.
- Expired/rejected/pre-approval-cancelled attempts release their code slot; approved purchases keep
  the confirmed attribution.

### Phase 4 — Multi-session cart — **[Deferred — post-MVP, §0a]**

**Objective:** add commercial composition only after single-session capacity and payment are stable.

Nothing in this phase ships with the MVP. Requirements are retained for the future delivery; the server already satisfies several of them (§0a as-built note).

**Deliverables**

- Cart containing multiple sessions with a combined total.
- One purchase and one voucher for all lines.
- Atomic hold of every seat or none.
- One ticket, with its own QR, per person and session after approval.

**Acceptance criteria**

- If one line lacks capacity, no line in the purchase is held.
- When a purchase expires, all of its seats are released exactly once.
- Approving a multi-session purchase issues exactly one ticket per person and session.

**[Deferred — post-MVP] Week Pass and upgrades**

Cut from the MVP (§0b); the requirements are retained here and in PRD §7.2–7.3 for the future delivery.

- Week Pass with every current session in the program, public and active-participant prices, one
  reserved seat in every session, and Festival Fast Pass as an optional benefit without fulfillment.
- Pass recommendation when the cart contains every individual session, including displayed savings,
  and buyer confirmation before replacing them.
- A single pass QR presented to the holder, scanned at every included session.
- Self-service upgrade from an individual ticket: preserves the existing seat, verifies capacity in
  every remaining session, charges only the difference, and confirms new tickets after approval —
  failing without modifying the original ticket when any remaining session lacks capacity.

### Phase 5 — Operations, waitlist, cancellation, and check-in

**Objective:** complete the capabilities required to run in-person sessions and support exceptions.

**Deliverables**

- Session-specific check-in through QR or manual entry.
- Time and admin recording with duplicate check-in prevention.
- Dashboard per occurrence showing:
  - Confirmed tickets.
  - Active holds and remaining seats.
  - Pending payments.
  - Waitlist.
  - Check-ins.
- Independent waitlist for each sold-out occurrence.
- Notifications for waitlist growth and released seats.
- Manual selection of any waitlisted person and a timed purchase invitation.
- Self-service cancellation until two days before the session, without refund.
- Cancellation confirmation and no-refund notice.
- Glitter-initiated cancellation with an administrative refund workflow.
- Rescheduling with a valid ticket and the option to request a refund.
- Complete admin support: adjust/complete purchases, manage vouchers, approve, cancel, resend, and document the reason.
- Action history and attendee export or review.

**Acceptance criteria**

- A second scan shows “already used” and does not create another attendance record.
- Cancellation within the window invalidates the ticket and releases the seat; outside it, the action is blocked.
- Versioned no-refund acceptance can be reviewed before support is provided.
- Releasing a seat with an active waitlist notifies the team but does not invite anyone automatically.
- An admin can choose any person on the list and the invitation is audited.
- Cancelling a session stops sales and marks affected payments for refund handling.
- Rescheduling preserves ticket validity and allows a refund request to be recorded.
- Dashboard metrics reconcile with holds, purchases, tickets, and check-ins.

### Phase 6 — Hardening, pilot, and launch

**Objective:** test security, concurrency, and operations before selling Glitter Week to the public.

**Deliverables**

- Automated tests for rules, transitions, permissions, and idempotency.
- Concurrency tests for:
  - Final seat.
  - Multi-session purchase.
  - Simultaneous expiration and voucher upload.
  - Simultaneous cancellation and check-in or approval.
- Reconciliation and alerts for expired holds, unissued tickets, failed emails, and inconsistent states.
- Security review of tokens, admin authorization, and buyer isolation.
- Accessibility, mobile, and error-recovery review.
- Resend deliverability configuration and email idempotency.
- Feature flag, rollback plan, and operational runbook.
- Reviewed Glitter Week program, session, price, venue, and capacity data.
- Internal rehearsal and controlled pilot before general availability.

**Acceptance criteria / launch gate**

- The critical suite passes without overselling, duplicate issuance, or cross-account access.
- Expiration jobs are retryable and reconcilable.
- An email failure does not reverse an approved payment or duplicate tickets on retry.
- Secure links can be revoked and do not expose other buyers' data.
- The team completes a rehearsal covering purchase, review, changes requested, approval, cancellation, waitlist, and check-in.
- The dashboard supports operational resolution without direct database intervention.
- A documented procedure exists for manual refunds after cancellation or rescheduling.
- Public launch occurs behind a feature flag with monitoring for capacity, pending payments, email failures, and check-in.

## 3. Minimum MVP validation matrix

Every applicable journey must be tested as a guest, an active participant, and an ineligible signed-in user when the audience mode allows it.

| Critical scenario                       | Expected result                                                   |
| --------------------------------------- | ----------------------------------------------------------------- |
| Two people request the final seat       | Only one receives a hold or confirmation                          |
| Hold expires without a voucher          | All seats are released and no tickets exist                       |
| Voucher arrives at the 20-minute limit  | One transition wins; no orphaned seats remain                     |
| Voucher is replaced                     | The newest is reviewed and history is retained                    |
| Approval is repeated                    | Tickets, emails, and logical charges are not duplicated           |
| Attendee cancels                        | Two-day limit applies, no refund is due, and capacity is released |
| Glitter cancels or reschedules          | The applicable refund policy is applied                           |
| QR is scanned twice                     | Only one attendance record is created                             |
| Buyer opens another buyer's secure link | Access is denied                                                  |

**[Deferred — post-MVP, §0a]** "A cart contains one sold-out session → no sessions are held"
validates the multi-line atomic hold. It moves to post-MVP validation with the cart itself. The
server-side capability exists and is covered by tests (§0a as-built note); what is deferred is the
buyer-facing flow and the requirement to validate it before launch.

## 4. Post-MVP deliveries

These enhancements require additional decisions or infrastructure and do not block Glitter Week:

### Week Pass — deferred out of the MVP (§0b)

- The pass itself: every session in the program, public and active-participant prices, one seat held
  in every included session.
- Pass benefits, including the Festival Fast Pass representation.
- The single pass QR delivered instead of one QR per ticket.
- Cart recommendation and savings display when the cart holds every individual session.
- Self-service upgrade from an individual ticket, charging only the difference.

Full requirements are retained in Phase 4 above and PRD §7.2–7.3.

### Benefits and festival access

- Festival Fast Pass fulfillment through a bracelet or another credential.
- Benefit validation on every linked festival date.
- Separate Fast Pass sales.
- General catalog of reusable benefits.

### Roles and operations

- Limited check-in operator role.
- Admin teams scoped to a program.
- Separate permissions for content, payment, support, and door operations.

### Tickets and commerce

- Multi-session cart. Before it ships, reservation across every line must be atomic.
- Controlled ticket transfer or resale.
- Online payment provider.
- Automated bank refunds.
- Passes with a selectable subset of sessions.
- Purchase of multiple named tickets for different people.

### Scheduling and content

- Workshop materials and prerequisites.
- Advanced conference agenda.
- Recurring sessions and series.
- Certificates or post-session resources.

### Waitlist

- Automatic promotion by order or priority.
- Configurable expiration and re-offer rules.
- Waitlist conversion and analytics.

## 5. Dependencies and risks that must not be deferred

| Area          | Risk if deferred                          | Required mitigation                                                 |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Eligibility   | Incorrect charge or unauthorized access   | Canonical source, server validation, and snapshot                   |
| Capacity      | Overselling or orphaned seats             | Transactional holds, idempotency, and reconciliation                |
| Vouchers      | Wrong file reviewed or audit history lost | Immutable versions and explicit state                               |
| Guest access  | Data or ticket exposure                   | Opaque, revocable, resource-authorized tokens                       |
| QR issuance   | Duplicates or access before payment       | Idempotent issuance only after approval                             |
| Cancellation  | Inconsistent policy application           | Versioned acceptance and centralized rules                          |
| Email         | User cannot access status or ticket       | Link on confirmation, retries, and web recovery                     |
| Audit history | Support actions without evidence          | Actor, reason, prior/new state, and timestamp for sensitive actions |
