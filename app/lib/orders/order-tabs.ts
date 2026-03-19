export const ORDER_TAB_VALUES = [
	"pending",
	"payment_verification",
	"paid",
	"delivered",
	"cancelled",
] as const;

export type OrderTabValue = (typeof ORDER_TAB_VALUES)[number];
