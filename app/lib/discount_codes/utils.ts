import { DateTime } from "luxon";

import { formatMoney, STORE_TIMEZONE } from "@/app/lib/formatters";

/** The longest code a participant can apply; see `applyDiscountSchema`. */
export const DISCOUNT_CODE_MAX_LENGTH = 64;
export const DISCOUNT_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
/** How many accounts one code can be reserved for. */
export const MAX_DISCOUNT_CODE_USERS = 500;
/** A code this close to its expiry is flagged in the list. */
export const EXPIRING_SOON_DAYS = 7;

/** Codes are stored lowercase and matched case-insensitively. */
export function normalizeDiscountCode(code: string) {
  return code.trim().toLowerCase();
}

export function isValidDiscountCodeFormat(code: string) {
  const trimmed = code.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= DISCOUNT_CODE_MAX_LENGTH &&
    DISCOUNT_CODE_PATTERN.test(trimmed)
  );
}

/**
 * The form asks for a day; a code stays valid through the end of that day in
 * Bolivia. Read as a bare date, `2026-10-18` is UTC midnight, which in La Paz
 * is the evening of the 17th — the code died before its last day began.
 */
export function expiryDayToTimestamp(day: string): Date | null {
  const parsed = DateTime.fromISO(day, { zone: STORE_TIMEZONE });
  return parsed.isValid ? parsed.endOf("day").toJSDate() : null;
}

/** The `YYYY-MM-DD` a stored expiry falls on in Bolivia, for a date input. */
export function timestampToExpiryDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).toISODate() ?? "";
}

/** Today in Bolivia as `YYYY-MM-DD`, shifted by `plus` when given. */
export function storeDay(plus?: {
  weeks?: number;
  months?: number;
  years?: number;
}) {
  const today = DateTime.now().setZone(STORE_TIMEZONE);
  return (plus ? today.plus(plus) : today).toISODate() ?? "";
}

export type DiscountCodeStatus =
  | "active"
  | "exhausted"
  | "inactive"
  | "expired";

export const DISCOUNT_CODE_STATUS_LABELS: Record<DiscountCodeStatus, string> = {
  active: "Activo",
  exhausted: "Agotado",
  inactive: "Inactivo",
  expired: "Vencido",
};

/** Expired codes are hidden from the list until asked for. */
export const DEFAULT_DISCOUNT_CODE_STATUSES: DiscountCodeStatus[] = [
  "active",
  "exhausted",
  "inactive",
];

type StatusInput = {
  isActive: boolean;
  expiresAt: Date | string;
  maxUses: number | null;
  currentUses: number;
};

/**
 * Why a code does or does not apply right now, the most lasting reason
 * first: an expired code stays expired whatever else changes, while an admin
 * can switch an inactive one back on, and raise an exhausted one's limit.
 */
export function getDiscountCodeStatus(
  code: StatusInput,
  now: Date = new Date(),
): DiscountCodeStatus {
  if (new Date(code.expiresAt) < now) return "expired";
  if (!code.isActive) return "inactive";
  if (code.maxUses !== null && code.currentUses >= code.maxUses) {
    return "exhausted";
  }
  return "active";
}

export function isExpiringSoon(expiresAt: Date | string, now = new Date()) {
  const expiry = new Date(expiresAt).getTime();
  return (
    expiry >= now.getTime() &&
    expiry - now.getTime() <= EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  );
}

export function formatDiscountValue(code: {
  discountUnit: "percentage" | "amount";
  discountValue: number;
}) {
  return code.discountUnit === "percentage"
    ? `${code.discountValue}%`
    : formatMoney(code.discountValue);
}
