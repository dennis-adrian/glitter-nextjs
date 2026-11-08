// The ledger metadata keys of a repricing refund, without the queries that read
// them, so pure code (the finance page's credit attribution) can recognise a
// refund grant without importing the database.

/**
 * Marks a refund grant as belonging to a reservation, so later reads find it.
 *
 * The command's idempotency key already names the reservation, but a key is an
 * identifier, not a field to query on. This is the field. Every command that
 * refunds a reservation's surplus tags its grant with it — the name predates
 * the full-table upgrade, and renaming it would orphan the grants already
 * posted under it. A release that takes part of a refund back tags its offset
 * with it too, so the two net.
 */
export const STAND_CHANGE_REFUND_RESERVATION_KEY =
  "standChangeRefundReservationId";

/**
 * On a refund grant, the part of it that handed back a late partner's payment
 * rather than money on the cobro: a stand cheaper than what the late partner
 * alone already paid (`ReservationRepricing.latePartnerRefundAmount`).
 *
 * That part never sat on the cobro, so the tender must not net it — clamped at
 * what the cobro holds, it would read as dropped, then come back against the
 * next payment and show a paid cobro with a balance. It comes off the
 * late-partner figure instead (`latePartnerRefundedAmount`), which is exactly
 * the money it returned. Absent on every other grant and on release offsets.
 */
export const LATE_PARTNER_REFUND_AMOUNT_KEY = "latePartnerRefundAmount";
