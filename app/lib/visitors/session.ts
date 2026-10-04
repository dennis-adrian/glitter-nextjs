import "server-only";

import { createHash } from "node:crypto";

import { cookies, headers } from "next/headers";

import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import {
  signVisitorToken,
  verifyVisitorIdToken,
  verifyVisitorToken,
} from "@/app/lib/visitors/access-tokens";

const SESSION_COOKIE = "glitter_visitor";
const PENDING_EMAIL_COOKIE = "glitter_visitor_email";
const HISTORY_COOKIE = "glitter_visitor_history";

/** Long enough for a day at the festival; short enough for a shared phone. */
export const VISITOR_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PENDING_EMAIL_TTL_MS = 60 * 60 * 1000;
/** How long a mailed "ver mis entradas" link keeps working. */
export const TICKET_HISTORY_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/** Lets this browser act as the visitor: see and get their tickets. */
export async function startVisitorSession(visitorId: number) {
  const cookieStore = await cookies();
  const historyVisitorId = verifyVisitorIdToken(
    cookieStore.get(HISTORY_COOKIE)?.value,
    "history",
  );
  // A shared phone: whoever signs in next must not inherit the history the
  // previous visitor opened.
  if (historyVisitorId !== null && historyVisitorId !== visitorId) {
    cookieStore.delete(HISTORY_COOKIE);
  }
  cookieStore.set(
    SESSION_COOKIE,
    signVisitorToken({
      purpose: "session",
      subject: visitorId,
      ttlMs: VISITOR_SESSION_TTL_MS,
    }),
    cookieOptions(VISITOR_SESSION_TTL_MS),
  );
  cookieStore.delete(PENDING_EMAIL_COOKIE);
}

export async function endVisitorSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(PENDING_EMAIL_COOKIE);
  cookieStore.delete(HISTORY_COOKIE);
}

/** The visitor this browser acts as, or null. */
export async function currentVisitorId(): Promise<number | null> {
  const cookieStore = await cookies();
  return verifyVisitorIdToken(cookieStore.get(SESSION_COOKIE)?.value, "session");
}

/** Holds a new visitor's email between the email step and the form. */
export async function holdPendingVisitorEmail(email: string) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(HISTORY_COOKIE);
  cookieStore.set(
    PENDING_EMAIL_COOKIE,
    signVisitorToken({
      purpose: "pending-email",
      subject: email,
      ttlMs: PENDING_EMAIL_TTL_MS,
    }),
    cookieOptions(PENDING_EMAIL_TTL_MS),
  );
}

export async function pendingVisitorEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const subject = verifyVisitorToken(
    cookieStore.get(PENDING_EMAIL_COOKIE)?.value,
    "pending-email",
  );
  return typeof subject === "string" ? subject : null;
}

export function ticketHistoryToken(visitorId: number) {
  return signVisitorToken({
    purpose: "history",
    subject: visitorId,
    ttlMs: TICKET_HISTORY_LINK_TTL_MS,
  });
}

export function visitorIdFromHistoryToken(token: unknown) {
  return verifyVisitorIdToken(token, "history");
}

/**
 * Opens a visitor's ticket history in this browser, after they followed the
 * link we mailed them. Entering an email only starts a registration session;
 * seeing every past ticket takes proof that the inbox is theirs. Also starts
 * the registration session, so their current tickets open without asking.
 */
export async function openTicketHistory(visitorId: number) {
  // Session first: it drops another visitor's history cookie, which must not
  // take the one set below with it.
  await startVisitorSession(visitorId);
  const cookieStore = await cookies();
  cookieStore.set(
    HISTORY_COOKIE,
    signVisitorToken({
      purpose: "history",
      subject: visitorId,
      ttlMs: VISITOR_SESSION_TTL_MS,
    }),
    cookieOptions(VISITOR_SESSION_TTL_MS),
  );
}

/** The visitor whose ticket history this browser may see, or null. */
export async function ticketHistoryVisitorId(): Promise<number | null> {
  const cookieStore = await cookies();
  return verifyVisitorIdToken(cookieStore.get(HISTORY_COOKIE)?.value, "history");
}

/**
 * A stable, non-reversible name for the caller's network address.
 *
 * Only headers the hosting platform sets are read: Vercel overwrites
 * `x-real-ip` and `x-forwarded-for` with the connecting address. Headers it
 * passes through as sent, such as `cf-connecting-ip` (the site is not behind
 * Cloudflare), would let a script pick a new address for every request.
 */
async function callerFingerprint() {
  const requestHeaders = await headers();
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0];
  const clientIdentifier =
    requestHeaders.get("x-real-ip")?.trim() ||
    forwardedIp?.trim() ||
    `unknown:${requestHeaders.get("user-agent") ?? "no-user-agent"}`;
  return createHash("sha256").update(clientIdentifier).digest("hex");
}

/**
 * Whether the caller may make another `scope` request now. Keyed by network
 * address, or by `subject` when given (an email, a visitor id). Fails closed:
 * a limiter error refuses the request rather than letting floods through.
 */
export async function allowVisitorRequest(input: {
  scope: string;
  limit: number;
  windowMs: number;
  subject?: string | number;
}): Promise<boolean> {
  try {
    const who =
      input.subject === undefined
        ? `ip:${await callerFingerprint()}`
        : `subject:${createHash("sha256").update(String(input.subject)).digest("hex")}`;
    return await consumeActionRateLimit({
      key: `visitor-${input.scope}:${who}`,
      limit: input.limit,
      windowMs: input.windowMs,
    });
  } catch {
    return false;
  }
}
