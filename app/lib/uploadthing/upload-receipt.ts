import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Proof that a file URL is one the caller uploaded themselves.
 *
 * Some actions take an uploaded file's URL from the browser and later delete
 * whatever file their row points at. Every UploadThing URL is public, so
 * without proof of provenance a user could point a row at somebody else's
 * file and have it deleted. UploadThing cannot say who uploaded a given key,
 * so the upload route signs `(uploaderId, url)` at upload time, where the
 * uploader is authenticated, and the action checks that signature against the
 * caller.
 *
 * Each route signs under its own label, so a receipt from one route never
 * verifies for another.
 *
 * The MAC key is derived from `UPLOADTHING_TOKEN` with that label. The token
 * already grants delete rights over every file these receipts protect, so a
 * receipt is exactly as strong as the capability it guards, and no extra
 * secret has to be provisioned.
 *
 * Receipts do not expire. Replaying one can only put the same caller's own
 * upload back on a row they can already edit.
 */

const RECEIPT_CONTEXTS = {
  profilePicture: "glitter:profile-picture-upload-receipt:v1",
  imageUploader: "glitter:image-uploader-upload-receipt:v1",
  festivalActivityParticipantProof:
    "glitter:festival-activity-participant-proof-upload-receipt:v1",
} as const;

/** The UploadThing route that minted a receipt. */
export type UploadReceiptRoute = keyof typeof RECEIPT_CONTEXTS;

/** Who uploaded: a profile id, or a Clerk user id where the route has no profile. */
export type UploaderId = number | string;

function receiptKey(route: UploadReceiptRoute): Buffer {
  const token = process.env.UPLOADTHING_TOKEN;
  if (!token) {
    throw new Error("UPLOADTHING_TOKEN is required to sign upload receipts");
  }
  return createHmac("sha256", token).update(RECEIPT_CONTEXTS[route]).digest();
}

function computeReceipt(
  route: UploadReceiptRoute,
  uploaderId: UploaderId,
  imageUrl: string,
): Buffer {
  return createHmac("sha256", receiptKey(route))
    .update(`${uploaderId}\n${imageUrl}`)
    .digest();
}

export function signUploadReceipt(
  route: UploadReceiptRoute,
  uploaderId: UploaderId,
  imageUrl: string,
): string {
  return computeReceipt(route, uploaderId, imageUrl).toString("base64url");
}

export function verifyUploadReceipt({
  route,
  uploaderId,
  imageUrl,
  receipt,
}: {
  route: UploadReceiptRoute;
  uploaderId: UploaderId;
  imageUrl: string;
  receipt: unknown;
}): boolean {
  if (typeof receipt !== "string" || receipt.length === 0) return false;

  const expected = computeReceipt(route, uploaderId, imageUrl);
  const presented = Buffer.from(receipt, "base64url");

  // timingSafeEqual throws on a length mismatch, and the length is not secret.
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}
