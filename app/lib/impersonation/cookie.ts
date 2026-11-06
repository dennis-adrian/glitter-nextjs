import "server-only";

import { createHash, randomBytes } from "crypto";

import {
  IMPERSONATION_DURATION_SECONDS,
  IMPERSONATION_TOKEN_COOKIE,
} from "@/app/lib/impersonation/definitions";

/** 32 random bytes, base64url: always 43 characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A fresh opaque token for a view cookie. */
export function newImpersonationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the row keeps instead of the token: a database read is not a cookie. */
export function hashImpersonationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Anything else in the cookie is not ours, and is never looked up. */
export function isWellFormedImpersonationToken(
  value: unknown,
): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

type CookieWriter = {
  set: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      path: string;
      maxAge: number;
    },
  ) => unknown;
};

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // Safari refuses Secure cookies on http://localhost.
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: Salir and the links into a view are same-site anyway,
    // and Strict would drop the view on the first visit from a notification.
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/**
 * Writes the view cookie, for as long as the view lasts. Only a Server
 * Function or a Route Handler can (`cookies().set`); a render cannot.
 */
export function setImpersonationCookie(store: CookieWriter, token: string) {
  store.set(
    IMPERSONATION_TOKEN_COOKIE,
    token,
    cookieOptions(IMPERSONATION_DURATION_SECONDS),
  );
}

/** Removes the view cookie, with the attributes it was written with. */
export function clearImpersonationCookie(store: CookieWriter) {
  store.set(IMPERSONATION_TOKEN_COOKIE, "", cookieOptions(0));
}
