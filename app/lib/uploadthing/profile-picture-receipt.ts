import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Proof that a profile picture URL is a file the caller uploaded themselves.
 *
 * `updateProfilePicture` gets its URL from the browser, and it later deletes
 * whatever file a row points at when the picture changes. Without proof of
 * provenance, a user could point their row at somebody else's picture — every
 * avatar URL is public — and have that file deleted on their next change.
 * UploadThing cannot say who uploaded a given key, so the `profilePicture`
 * route signs `(uploaderId, url)` at upload time, where the uploader is
 * authenticated, and the action checks that signature against the caller.
 *
 * The MAC key is derived from `UPLOADTHING_TOKEN` with a label for
 * this purpose. That token already grants delete rights over every file these
 * receipts protect, so a receipt is exactly as strong as the capability it
 * guards, and no extra secret has to be provisioned.
 *
 * Receipts do not expire. Replaying one can only put the same caller's own
 * upload back on a row they can already edit.
 */

const RECEIPT_CONTEXT = "glitter:profile-picture-upload-receipt:v1";

function receiptKey(): Buffer {
  const token = process.env.UPLOADTHING_TOKEN;
  if (!token) {
    throw new Error("UPLOADTHING_TOKEN is required to sign upload receipts");
  }
  return createHmac("sha256", token).update(RECEIPT_CONTEXT).digest();
}

function computeReceipt(uploaderId: number, imageUrl: string): Buffer {
  return createHmac("sha256", receiptKey())
    .update(`${uploaderId}\n${imageUrl}`)
    .digest();
}

export function signProfilePictureUpload(
  uploaderId: number,
  imageUrl: string,
): string {
  return computeReceipt(uploaderId, imageUrl).toString("base64url");
}

export function verifyProfilePictureUpload({
  uploaderId,
  imageUrl,
  receipt,
}: {
  uploaderId: number;
  imageUrl: string;
  receipt: unknown;
}): boolean {
  if (typeof receipt !== "string" || receipt.length === 0) return false;

  const expected = computeReceipt(uploaderId, imageUrl);
  const presented = Buffer.from(receipt, "base64url");

  // timingSafeEqual throws on a length mismatch, and the length is not secret.
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}
