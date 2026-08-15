# PRD: FastPass (Pase Rápido)

**Product:** Glitter  
**Public name:** Pase Rápido  
**Date:** 2026-08-02  
**Status:** Proposed  
**Owner:** Glitter

---

## 1. Executive summary

Glitter festivals remain free to enter. Pase Rápido is an optional paid product that lets a visitor avoid the general-admission line and use a priority entrance throughout one festival day.

Pase Rápido does not override legal venue capacity, security controls, or event hours. Operations will limit sales and preserve capacity for expected Pase Rápido visitors so the priority entrance is as close to line-free as practical.

At the first entrance, an online buyer presents a ticket QR and receives a tamper-resistant wristband. The wristband becomes the re-entry credential for the rest of the day; no further QR scan is required. Every visitor may re-enter the festival, but visitors without Pase Rápido must use the general-admission line again.

Pase Rápido supports two sales channels:

1. **Online:** guest purchase, 20-minute inventory hold, bank-QR payment, voucher upload, admin review, and ticket QR delivery.
2. **On-site POS:** staff-assisted sale after payment, automatic approval, immediate activation, and immediate wristband delivery.

## 2. Product promise

Recommended public message:

> **Menos fila. Más festival.** Ingresá por el acceso prioritario Pase Rápido durante todo el día. Escaneá tu QR una sola vez y reingresá mostrando tu pulsera.

Supporting benefits:

- Avoid the general-admission line.
- Priority access on every entrance.
- QR validation only once.
- Wristband valid throughout the selected festival day.

Required qualification:

> El ingreso está sujeto al aforo del recinto, los controles de seguridad, el horario del festival y la posible espera de otros visitantes con Pase Rápido.

The product must not be marketed with an absolute “no line” or guaranteed-immediate-entry promise.

## 3. Goals

- Give visitors a valuable, clearly explained paid priority-access option without weakening free admission.
- Reduce repeated QR validation for returning Pase Rápido visitors.
- Limit and account for every expected priority visitor, including children.
- Support recoverable guest checkout without creating public user accounts.
- Reuse Glitter's existing bank-QR and voucher-review operating model.
- Support fast, audited on-site sales through a POS-style interface.
- Keep sales, cancellations, payment methods, operators, and notifications auditable.
- Give admins per-festival-day control over availability, channels, pricing, and operational rules.

## 4. Non-goals

- Replacing free festival admission.
- Guaranteeing entry when the venue is legally full.
- Creating general-purpose public accounts.
- Building a general application-wide roles and permissions system.
- Automating bank refunds.
- Scanning a QR on every FastPass re-entry.
- Giving Pase Rápido priority over first-arrival promotional gifts.
- Providing reserved seating, activity access, or other unrelated festival benefits.
- Full cash-drawer, shift, or accounting-ledger reconciliation in the first release.

## 5. Terminology

| Term                     | Definition                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Festival day             | One `festival_dates` occurrence. Pase Rápido is sold and valid per day, not for an entire multi-day festival.   |
| Paid pass                | One revenue-bearing Pase Rápido for one adult or visitor aged 11+.                                              |
| Child companion          | A visitor aged 10 or under linked to one paid adult. Free and not counted as a sale or revenue.                 |
| Priority visitor         | A paid pass holder or declared child companion expected to use priority access.                                 |
| Paid inventory           | Maximum number of revenue-bearing passes available.                                                             |
| Priority capacity        | Maximum expected people using priority access, including child companions.                                      |
| Activation               | First validation of a pass and issuance of its wristband.                                                       |
| Re-entry                 | A later entrance validated visually by wristband, without another QR scan.                                      |
| Cancellation transaction | An immutable negative transaction linked to an original sale; never deletion. It is not automatically a refund. |

## 6. Users and access

### 6.1 Online buyer

- Does not need or receive a Glitter account.
- Purchases one or more passes through a guest checkout.
- Uses an unguessable secure link to resume payment, upload a voucher, review status, and retrieve approved ticket QRs.
- May cancel only before uploading a voucher and before the 20-minute hold expires.

### 6.2 Existing admin and festival admin

Global `admin` users retain full FastPass management access. A
`festival_admin` has the same capabilities only for festivals listed in
`festival_admin_assignments`. Within that scope, they may:

- Configure Pase Rápido per festival day.
- Enable or disable the offering.
- Open, pause, or resume each sales channel.
- Review online vouchers.
- Create on-site sales.
- Create and revoke POS operator access.
- View all sales, tickets, attendance, transactions, and audit history.
- Create cancellation transactions and manage festival-cancellation refunds.

### 6.3 POS operator

A POS operator is not a general Glitter user and receives no dashboard access. An admin creates an event-scoped credential containing an operator name, festival day, expiration, and revocation state.

The operator may:

- View their assigned festival day and remaining on-site availability.
- Create automatically approved on-site sales.
- View their recent transactions for recovery from reloads or network interruption.

The operator may not:

- Change settings, prices, payment methods, or inventory.
- Review online vouchers.
- View the complete visitor database or all festival transactions.
- Delete or cancel a sale.

Every POS transaction records the operator credential used. This is a deliberately narrow FastPass authorization mechanism, not general RBAC.

## 7. Festival-day configuration

Admins configure Pase Rápido independently for each festival day.

### 7.1 Offering and sales state

- **Offering enabled/disabled:** controls whether Pase Rápido is offered for the day.
- **Online sales enabled/disabled:** controls the public online channel.
- **On-site sales enabled/disabled:** controls the POS channel.
- **Sales paused/resumed:** stops or resumes new purchases without invalidating existing passes.
- Existing approved passes remain valid when an offering or sales channel is disabled.
- Festival cancellation is a separate operation and begins refund handling.

### 7.2 Commercial and capacity settings

- Price per paid pass.
- Online sales start and end timestamps.
- Maximum paid-pass inventory.
- Maximum priority-visitor capacity.
- Online and on-site paid-pass allocations.
- Online and on-site priority-person allocations.
- Maximum paid passes per online purchase; default **10**, configurable.
- Hold duration fixed at **20 minutes** for the initial release, matching paid programs.

Unused allocation may be moved between channels by an admin. Transfers must never reduce a channel below its already sold or held quantities.

### 7.3 On-site settings

- Bank-QR payment enabled by default.
- Cash payment optionally enabled.
- At least one on-site payment method must remain enabled while on-site sales are open.
- Payment-proof upload for on-site bank-QR sales: required or optional.
- Visitor details for on-site holders: required or optional; **optional by default**.
- When details are optional, the POS hides them under an explicit **Add visitor details** action so the normal sale remains anonymous and fast.
- Internal notification recipients.
- Notify recipients on completed on-site sale: yes/no.
- Notify recipients on cancelled transaction: yes/no.

The FastPass price is the same across online and on-site channels and cannot be overridden by a seller.

## 8. Inventory and capacity

Paid inventory and priority capacity are separate controls.

Example:

- 100 paid passes available.
- 120-person priority capacity.
- 80 paid passes sold and 15 children declared.
- Reports show **80 paid sales**, **15 child companions**, and **95 expected priority visitors**.

Rules:

- Every paid holder consumes one paid-inventory unit and one priority-capacity unit.
- Every child companion consumes one priority-capacity unit only.
- Child companions never count as sold passes or revenue.
- Pending online purchases consume both applicable allocations during the hold.
- Uploaded vouchers preserve allocation until review is resolved.
- Approved online and on-site sales consume allocation permanently unless a valid cancellation restores it.
- Availability checks and mutations must be atomic and concurrency-safe.
- On-site allocation protects visitors from paying after online demand has consumed all sellable capacity.
- A sale must fit the complete group; partial group allocation is not allowed.

## 9. Children aged 10 or under

- A paid adult may bring up to **five** child companions aged 10 or under.
- Child companions use Pase Rápido free with their responsible adult.
- Children must be declared during purchase.
- Collect only the number of children linked to each responsible adult. The adult confirms that every declared child is aged 10 or under.
- Do not collect a child's name, exact age, birth date, email, phone, document, or other personal data.
- Every child receives a wristband during activation.
- A child cannot enter or re-enter through Pase Rápido independently.
- Undeclared children use the general entrance unless an admin authorizes and records an exception.
- Visitors aged 11 or older require their own paid pass.

## 10. Online purchase flow

### 10.1 Checkout and identity

- The buyer may purchase multiple paid passes for a group.
- Each paid pass belongs to one holder and receives an individual ticket QR after approval.
- Each child companion is linked to one responsible paid holder.
- Buyer identity and contact data are always required for online purchases because there are no public accounts.
- Adult-holder data follows the existing festival visitor-registration dataset so an existing registration can be linked or a registration can be created without another visitor flow.
- The buyer accepts the capacity, wristband, cancellation, and refund policy versions.
- A client-generated idempotency key prevents duplicate purchases on repeat submission.

### 10.2 Server-persisted recovery

The purchase is created before the payment page is shown. The server stores purchase contents, status, allocation, expiration, and vouchers.

- A secure access token is issued; only its hash is stored.
- Reloading or reopening the secure URL restores the current server state and server-based countdown.
- The link is emailed immediately and may also be retained locally as a convenience.
- A recovery form can resend a newly rotated secure link using the buyer email and purchase reference.
- The URL remains useful after expiration to explain the result, but no expired purchase can regain its allocation.

### 10.3 Payment hold

- The complete group allocation is held for 20 minutes from purchase creation.
- The visitor pays with the displayed bank QR and uploads a voucher.
- Upload before the deadline moves the purchase to **Under verification** and stops automatic expiration.
- No upload by the deadline moves the purchase to **Expired** and releases allocation.
- The buyer may cancel during **Pending upload** only. Cancellation is irreversible and releases allocation immediately.
- The cancellation confirmation warns the visitor to cancel only if they have not paid.
- A buyer who already transferred money must upload the voucher instead.

### 10.4 Voucher review

Admins review the newest voucher and may:

- **Approve:** issue ticket QR codes and lock the voucher stream.
- **Request changes:** record a reason and give the buyer one additional 20-minute correction window while retaining allocation.
- **Reject:** record a reason, close the purchase, release allocation, and issue no ticket.

Every voucher version is immutable and retained for audit. A replacement creates a new version. The buyer cannot cancel after the first voucher is submitted.

If the correction window expires without a replacement, the purchase becomes
**Expired** with the system reason `correction_window_expired`. This releases
allocation, sends the expiration notification once, and reports the purchase as
expired rather than rejected. The state is terminal: notification retries do not
reopen it, and the buyer must start a new purchase.

### 10.5 Ticket delivery

- Approval issues one unique QR ticket per paid holder.
- The buyer receives the secure purchase link and all ticket QRs by email.
- Individual QRs may be shared with holders who arrive separately.
- Holder assignment may be changed before activation; it is locked after activation.
- Pase Rápido replaces the need for a second free-ticket checkout. When holder data identifies an existing festival ticket, the records are linked; otherwise the required festival registration is created as part of the FastPass flow.

## 11. On-site POS flow

### 11.1 POS experience

The on-site interface is a mobile-first, touch-friendly POS rather than a standard admin form. It displays:

- Festival and day.
- Configured price.
- Remaining on-site paid inventory and priority capacity.
- Adult and child quantity controls.
- Running total.
- Large payment-method controls.
- Conditional proof and visitor fields.
- A final **Confirm sale and issue wristbands** action.
- A success screen with exact adult and child wristband quantities and a clear **New sale** action.

The POS is online-only for the MVP. It must recover the last transaction after reload or an uncertain response and must never create a second sale from a retry.

### 11.2 Assisted sale

1. Visitor chooses paid holders and declares child companions; seller enters any required holder/contact data and the payment method.
2. The POS requests a short-lived server-side hold for the complete group. The server atomically validates current total/channel availability and returns an opaque hold ID plus deadline.
3. Only after the hold is confirmed does the seller ask the visitor to pay.
4. For bank QR, the seller photographs and uploads the voucher through the approved `fastPassPosVoucher` flow. The proof is retained in `fastPassVouchers` with the POS operator audit record; it is required or optional according to the festival-day snapshot.
5. A single atomic action validates the unexpired hold and its settings/operator/group ownership, consumes it, and creates the approved sale, positive financial transaction, passes, activation records, voucher record, and audit events.
6. The sale is automatically **Approved**; no admin review queue is involved.
7. Seller applies wristbands only after the success screen appears.

The hold is released when the seller cancels registration and expires
automatically after a short deadline when registration does not complete. An
expired or consumed hold cannot be reused. If payment occurred but consumption
fails, no wristband is issued and the seller escalates to an admin; the system
must never accept payment based only on a stale availability display.

### 11.3 On-site visitor data

- **Optional mode — default:** visitor fields remain hidden unless the seller chooses **Add visitor details**. The sale may remain fully anonymous.
- **Required mode:** collect only the full name of each paid holder and one contact method for the purchase: email or phone. Do not require both.
- Birthdate, gender, event-discovery source, address, identity document, and contact details for every holder are never required at the on-site POS.
- When optional information is sufficient to identify an existing visitor/ticket, the system may link it; otherwise it creates independent FastPass records and does not force festival-registration data collection.
- Adult paid quantity, child quantity per adult, payment method, amount, seller, festival day, and timestamp are always required.
- Anonymous paid passes still receive internal identifiers, activation records, and attendance counts.

### 11.4 Payment methods

**Bank QR**

- Enabled by default.
- Uses the configured bank QR.
- Payment-proof attachment follows the on-site required/optional setting.

**Cash**

- Disabled by default and enabled by an admin.
- No proof attachment.
- Seller enters cash received; POS calculates change.
- Sale records amount due, amount received, change, seller, and timestamp.

### 11.5 Immediate activation

- On-site tickets are created and activated in the same transaction.
- The activation method is **On-site sale**, not a fabricated QR scan.
- The on-site buyer does not join another line to scan a ticket.
- No ticket QR or confirmation email is sent to the visitor.
- The wristband is the visitor's credential from that moment.
- All paid holders and children included in an on-site sale must be physically present.

## 12. Entrance, wristbands, and re-entry

### 12.1 Online holder first entrance

1. Visitor joins the Pase Rápido entrance.
2. Staff scans the ticket QR once.
3. System verifies festival day, ticket validity, and activation status.
4. Staff applies the wristband.
5. System records activation time, method, and operator.

A duplicate scan displays **Already activated** and creates no additional activation.

### 12.2 Re-entry

- Staff visually validates the tamper-resistant wristband.
- No QR scan is required.
- The visitor waits only behind other Pase Rápido holders if a priority queue exists.
- Entry may pause when venue capacity or safety requires it.

### 12.3 Lost or removed wristbands

- No automatic replacement.
- Replacement is an admin-recorded exception after purchase verification.
- The original wristband must be recovered and destroyed whenever possible.
- Confirmation messages or order references are not entrance credentials.

## 13. Entrance gifts

Pase Rápido provides no priority for first-arrival promotional gifts. Gift eligibility is determined by physical arrival order at a common control point, independently of entrance type.

Operational details and visitor wording are defined in [Politica de obsequios de ingreso](./Politica_de_obsequios_de_ingreso.md).

## 14. Transactions, cancellations, and refunds

### 14.1 Immutability

- A sale is never deleted or overwritten.
- Completed sales create positive transactions.
- Cancelling a sale creates an equal negative cancellation transaction linked to the original.
- Cancellation requires an admin, reason, timestamp, and actor.
- Gross sales, cancellations, and net sales remain separately reportable.
- A cancellation is not automatically a refund.

### 14.2 Allocation after cancellation

- Allocation is restored only when no wristband was issued or staff confirms every issued wristband was recovered.
- If a physical wristband may remain usable, priority capacity remains consumed even when the financial transaction is cancelled.
- Cancelled, activated tickets retain their activation history.

### 14.3 Refund policy

- No refund for absence, changed plans, ordinary waiting, capacity delays, or visitor request.
- Refunds apply when Glitter cancels the festival.
- Festival cancellation stops sales, invalidates affected passes, and creates manual refund work items.
- QR and cash refunds are completed manually and recorded with amount, method, actor, timestamp, and reference/notes.
- Automated bank refunds are outside the MVP.

## 15. Notifications

### 15.1 Online visitor communications

- Initial secure payment/resume link.
- Voucher received.
- Changes requested with correction deadline.
- Approval with secure link and ticket QRs.
- Rejection or expiration.
- Festival cancellation and manual refund instructions.

### 15.2 On-site visitor communications

No visitor email is sent for on-site sales. The wristband is issued immediately and is the access credential.

### 15.3 Internal on-site notifications

Admins configure zero or more recipient emails and independently enable:

- Completed-sale notifications.
- Cancellation-transaction notifications.

Sale notifications include festival day, transaction reference, amount, payment method, paid holders, children, seller, timestamp, and proof availability. Cancellation notifications additionally include the original transaction, cancellation amount, reason, and admin actor.

Notification delivery is idempotent and best-effort. Failure never rolls back a committed sale or cancellation.

## 16. Admin module

The festival-day FastPass module contains:

1. **Overview:** state, price, availability, expected priority visitors, pending reviews, and sales totals.
2. **Configuration:** offering/channel state, windows, inventory/capacity allocations, payment methods, proof/data requirements, purchase limit, and notification recipients.
3. **Online payment review:** oldest submitted voucher first, complete history, approve/request changes/reject.
4. **Transactions:** immutable positive and negative entries with filters for channel, method, seller, date, and state.
5. **Tickets and activations:** valid, activated, cancelled, holder/anonymous status, child companions, and activation method.
6. **POS operators:** create, expire, revoke, and review operator activity.
7. **Refunds:** festival-cancellation work queue and manual resolution history.

Disabling or pausing sales never hides or invalidates previously purchased passes.

## 17. Reporting

At minimum, report per festival day:

- Paid passes held, sold, approved, activated, cancelled, and refunded.
- Child companions held, approved, and wristbanded.
- Total expected priority visitors.
- Remaining paid inventory and priority capacity by channel.
- Gross sales, cancellation transactions, refunds, and net sales.
- Revenue by online/on-site channel and QR/cash payment method.
- On-site sales by POS operator.
- Online purchases by payment state.
- Voucher review time.
- Online QR activations versus on-site-sale activations.
- Notification delivery failures.

Children must never appear in paid-pass sales or revenue metrics.

## 18. State contracts

### 18.1 Online purchase

| State                | Meaning                                                       | Allowed outcomes                                            |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `pending_upload`     | Group allocation held for 20 minutes                          | `under_verification`, `cancelled`, `expired`                |
| `under_verification` | Voucher submitted on time                                     | `approved`, `changes_requested`, `rejected`                 |
| `changes_requested`  | One 20-minute correction window is active                     | `under_verification`, `expired`                             |
| `approved`           | Payment approved and tickets issued                           | Admin cancellation or festival-cancellation refund workflow |
| `rejected`           | Payment not accepted                                          | Terminal; allocation released                               |
| `expired`            | Required upload/correction missed its deadline                | Terminal; allocation released                               |
| `cancelled`          | Buyer cancelled before upload or admin created a cancellation | Terminal; audit retained                                    |

### 18.2 On-site purchase

On-site creation moves directly to `approved` and creates activation records. It has no pending-upload or review state.

### 18.3 Pass ticket

| State       | Meaning                                            |
| ----------- | -------------------------------------------------- |
| `valid`     | Approved online ticket awaiting first entrance     |
| `activated` | Wristband issued online or during on-site sale     |
| `cancelled` | Pass invalidated; prior activation history remains |

## 19. Audit requirements

Record immutable events for:

- Settings and allocation changes.
- Purchase creation and expiration.
- Buyer cancellation.
- Voucher upload/replacement.
- Changes requested, approval, and rejection.
- Ticket issuance, activation, replacement exception, and cancellation.
- POS credential creation/revocation.
- On-site sale.
- Positive sale transaction.
- Cancellation transaction.
- Festival cancellation and refund resolution.
- Notification attempts and failures where operational follow-up is needed.

Sensitive admin actions require a non-empty reason.

## 20. Non-functional requirements

- All authorization is enforced server-side.
- Raw buyer and POS access tokens are never stored; only cryptographic hashes are persisted.
- Capacity and financial writes use database transactions and deterministic lock ordering.
- All money uses fixed-precision numeric values, never floating point.
- Checkout, voucher submission, approval, on-site sale, cancellation, activation, and email delivery are idempotent.
- Voucher files use the existing approved upload provider and file-size/type restrictions.
- Visitor and child data collection follows data-minimization principles.
- The POS is optimized for mobile use, large touch targets, and rapid repeated sales.
- An uncertain network result must resolve by reloading committed server state, never by blindly creating another sale.

## 21. Rollout and success criteria

### 21.1 Rollout

- Launch behind a `fast_pass` feature flag.
- Begin with admin-only visibility.
- Rehearse online purchase, expiry, voucher review, QR activation, POS QR sale, POS cash sale, cancellation, and notification delivery.
- Pilot on one festival day with conservative inventory and priority capacity.
- Publish only after entrance staff have wristbands, signage, and a documented capacity procedure.

### 21.2 Success metrics

- Median and 95th-percentile Pase Rápido entrance wait.
- Percentage of priority entries completed within the internal 5–10 minute target.
- Online checkout-to-voucher conversion.
- Voucher approval rate and review time.
- On-site transaction completion time.
- Duplicate/failed transaction rate.
- Paid-pass revenue and channel mix.
- Capacity discrepancies between expected and wristbanded priority visitors.
- Complaints about misleading line or gift priority messaging.

## 22. Acceptance summary

The MVP is ready when:

- Free admission and re-entry continue unchanged.
- Online guests can purchase, reload, recover, pay, upload, and receive individual ticket QRs without accounts.
- Unpaid holds release after 20 minutes without overselling.
- Admins can enable, pause, configure, review, report, cancel through compensating transactions, and manage refunds after festival cancellation.
- On-site operators can complete automatically approved QR or cash sales from a restricted POS and issue wristbands without a second scan line.
- Child companions consume priority capacity but never paid inventory or revenue.
- Every approved pass is either awaiting activation or has one immutable activation record.
- Re-entry relies on the wristband rather than repeated QR scans.
- Internal sale/cancellation notifications honor the configured recipient list.
- No sale or financial transaction can be deleted.
- Entrance gifts remain based on physical arrival order, not Pase Rápido priority.
