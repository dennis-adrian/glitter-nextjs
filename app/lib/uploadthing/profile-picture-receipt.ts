import "server-only";

import {
  signUploadReceipt,
  verifyUploadReceipt,
} from "@/app/lib/uploadthing/upload-receipt";

/**
 * Proof that a profile picture URL is a file the caller uploaded themselves.
 *
 * `updateProfilePicture` gets its URL from the browser, and it later deletes
 * whatever file a row points at when the picture changes. Without proof of
 * provenance, a user could point their row at somebody else's picture — every
 * avatar URL is public — and have that file deleted on their next change. The
 * `profilePicture` route signs `(profileId, url)` at upload time; see
 * `./upload-receipt` for how the receipt is built.
 */

export function signProfilePictureUpload(
  uploaderId: number,
  imageUrl: string,
): string {
  return signUploadReceipt("profilePicture", uploaderId, imageUrl);
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
  return verifyUploadReceipt({
    route: "profilePicture",
    uploaderId,
    imageUrl,
    receipt,
  });
}
