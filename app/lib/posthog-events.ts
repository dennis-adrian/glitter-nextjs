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
	// Visitor registration
	VISITOR_EMAIL_SUBMITTED: "visitor_email_submitted",
	VISITOR_REGISTRATION_COMPLETED: "visitor_registration_completed",
	// Live acts
	LIVE_ACT_CATEGORY_SELECTED: "live_act_category_selected",
	LIVE_ACT_SUBMITTED: "live_act_submitted",
} as const;
