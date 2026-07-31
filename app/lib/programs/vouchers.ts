/**
 * When a purchase will accept a payment proof.
 *
 * Pure so the page, the upload endpoint, and the confirming transaction can all
 * ask the same question and agree on the answer. Every one of them must — the
 * page decides whether to render the uploader, the endpoint decides whether to
 * accept bytes at all, and the transaction is the only one that counts.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §7.2.
 */

import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";

export type VoucherBlocker =
  | "not_payable"
  | "already_approved"
  | "hold_expired"
  | "purchase_closed";

export const VOUCHER_BLOCKER_LABELS: Record<VoucherBlocker, string> = {
  not_payable: "Esta inscripción no requiere pago",
  already_approved:
    "Tu pago ya fue aprobado; no necesitas subir otro comprobante",
  hold_expired: "Tu reserva expiró. Vuelve a inscribirte para tomar un cupo.",
  purchase_closed: "Esta compra ya no acepta comprobantes",
};

/**
 * Statuses that accept a voucher.
 *
 * `under_verification` is included so a buyer who spots a mistake can replace
 * the file before anyone reviews it, and `changes_requested` because being
 * asked for a better photo is precisely when a replacement is needed — roadmap
 * Phase 3 requires that state not to block one.
 */
const ACCEPTING_STATUSES: SessionPurchaseStatus[] = [
  "pending_upload",
  "under_verification",
  "changes_requested",
];

export type VoucherSubmissionSubject = {
  paymentMode: "bank_qr" | "free";
  status: SessionPurchaseStatus;
  holdExpiresAt: Date | null;
};

/**
 * Hosts UploadThing serves files from. Both shapes are in use in this app:
 * the legacy `utfs.io` and the per-app `<appId>.ufs.sh`. Mirrors the
 * `remotePatterns` allowlist in `next.config`.
 */
const UPLOADTHING_HOSTS = ["utfs.io", "ufs.sh"];

function isUploadThingHost(hostname: string): boolean {
  return UPLOADTHING_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

/**
 * Whether a submitted URL really is the file the upload flow just authorized.
 *
 * The action receives the URL from the browser, so on its own it proves
 * nothing: a buyer past the access check could submit any address and have it
 * stored — and reviewed — as their payment proof. That would break the
 * append-only guarantee outright, since a remote URL's contents can change
 * after an admin approves it.
 *
 * Binding the URL to the `key` returned by the upload, and pinning the host,
 * is what makes the stored proof the uploaded artifact. It is not a
 * cryptographic proof of provenance — a key is bearer data — but it removes
 * arbitrary-URL injection, which is the part that matters here.
 */
export function isAuthorizedVoucherUrl(
  fileUrl: string,
  fileKey: string,
): boolean {
  if (fileKey.trim().length === 0) return false;

  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (!isUploadThingHost(parsed.hostname)) return false;

  /**
   * Only the canonical `/f/<key>` route, which is what every UploadThing URL
   * in this database uses. Matching the last segment alone would also accept
   * `/anything/<key>`, so pinning both the route and the segment count keeps
   * an attacker from smuggling a path they control onto an allowed host.
   * Whole-segment equality is what rejects a suffixed key.
   */
  const segments = parsed.pathname.split("/").filter(Boolean);
  return (
    segments.length === 2 && segments[0] === "f" && segments[1] === fileKey
  );
}

/**
 * Whether a purchase is still in the paying part of its life — deliberately
 * without the hold check.
 *
 * This is what the page asks to decide whether to render the payment step, and
 * it must stay true for a `pending_upload` whose hold already lapsed: "your
 * reservation expired" is exactly what that buyer needs to read, and
 * `resolveVoucherSubmission` would say no. Hiding the card there would leave
 * them on a page that explains nothing.
 */
export function acceptsVouchers(purchase: {
  paymentMode: "bank_qr" | "free";
  status: SessionPurchaseStatus;
}): boolean {
  return (
    purchase.paymentMode === "bank_qr" &&
    ACCEPTING_STATUSES.includes(purchase.status)
  );
}

export type VoucherSubmissionCheck =
  | { allowed: true }
  | { allowed: false; blocker: VoucherBlocker };

export function resolveVoucherSubmission(
  purchase: VoucherSubmissionSubject,
  now: Date = new Date(),
): VoucherSubmissionCheck {
  if (purchase.paymentMode !== "bank_qr") {
    return { allowed: false, blocker: "not_payable" };
  }

  if (purchase.status === "approved") {
    return { allowed: false, blocker: "already_approved" };
  }

  if (!ACCEPTING_STATUSES.includes(purchase.status)) {
    return { allowed: false, blocker: "purchase_closed" };
  }

  /**
   * Only `pending_upload` is gated on the hold. Once a voucher is in, the seat
   * is held by the review itself (`isHoldingSeat` treats those statuses as
   * holding regardless of the deadline), so a buyer replacing a file mid-review
   * must not be turned away by a timestamp that no longer governs anything.
   */
  if (purchase.status === "pending_upload") {
    if (purchase.holdExpiresAt === null) {
      return { allowed: false, blocker: "hold_expired" };
    }
    if (purchase.holdExpiresAt.getTime() <= now.getTime()) {
      return { allowed: false, blocker: "hold_expired" };
    }
  }

  return { allowed: true };
}
