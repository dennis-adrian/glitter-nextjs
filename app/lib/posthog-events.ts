export const POSTHOG_EVENTS = {
  // User lifecycle
  USER_PROFILE_CREATED: "user_profile_created",
  // Festival flows
  FESTIVAL_TERMS_ACCEPTED: "festival_terms_accepted",
  FESTIVAL_CREATED: "festival_created",
  // Reservations
  RESERVATION_CONFIRMED: "reservation_confirmed",
  RESERVATION_CANCELLED: "reservation_cancelled",
  // Payments
  PAYMENT_UPLOADED: "payment_uploaded",
  FREE_RESERVATION_CONFIRMED: "free_reservation_confirmed",
  DISCOUNT_CODE_APPLIED: "discount_code_applied",
  // Store / Orders
  ORDER_PLACED: "order_placed",
  ORDER_PAYMENT_VOUCHER_UPLOADED: "order_payment_voucher_uploaded",
  STORE_ORDERS_EXPORTED: "store_orders_exported",
  STORE_ORDER_ADJUSTMENT_STARTED: "store_order_adjustment_started",
  STORE_ORDER_ADJUSTMENT_APPLIED: "store_order_adjustment_applied",
  STORE_ORDER_ADJUSTMENT_FAILED: "store_order_adjustment_failed",
  STORE_PROFITABILITY_REPORT_VIEWED: "store_profitability_report_viewed",
  STORE_PROFITABILITY_EXPORTED: "store_profitability_exported",
  // Visitor registration
  VISITOR_EMAIL_SUBMITTED: "visitor_email_submitted",
  VISITOR_REGISTRATION_COMPLETED: "visitor_registration_completed",
  // Live acts
  LIVE_ACT_CATEGORY_SELECTED: "live_act_category_selected",
  LIVE_ACT_SUBMITTED: "live_act_submitted",
  /**
   * Programs — screen views.
   *
   * `$pageview` / `$pageleave` already cover which URL was seen, by whom and for
   * how long. These add the catalog context the URL cannot carry (price,
   * remaining seats, purchase status) so funnels break down by session without
   * parsing pathnames.
   */
  PROGRAM_INDEX_VIEWED: "program_index_viewed",
  PROGRAM_VIEWED: "program_viewed",
  PROGRAM_SESSION_VIEWED: "program_session_viewed",
  PROGRAM_PURCHASE_VIEWED: "program_purchase_viewed",
  // Programs — registration funnel
  PROGRAM_REGISTRATION_STARTED: "program_registration_started",
  PROGRAM_REGISTRATION_ABANDONED: "program_registration_abandoned",
  PROGRAM_REGISTRATION_SUBMITTED: "program_registration_submitted",
  PROGRAM_REGISTRATION_COMPLETED: "program_registration_completed",
  PROGRAM_REGISTRATION_FAILED: "program_registration_failed",
  // Programs — payment
  PROGRAM_VOUCHER_FILE_SELECTED: "program_voucher_file_selected",
  PROGRAM_VOUCHER_SUBMITTED: "program_voucher_submitted",
  PROGRAM_VOUCHER_FAILED: "program_voucher_failed",
  PROGRAM_HOLD_EXPIRED: "program_hold_expired",
} as const;

export type PostHogEvent = (typeof POSTHOG_EVENTS)[keyof typeof POSTHOG_EVENTS];
