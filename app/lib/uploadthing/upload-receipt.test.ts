import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  signUploadReceipt,
  verifyUploadReceipt,
} from "@/app/lib/uploadthing/upload-receipt";

const OWN_URL = "https://app.ufs.sh/f/own-key";
const CLERK_ID = "user_2abc";

describe("upload receipts", () => {
  beforeEach(() => {
    vi.stubEnv("UPLOADTHING_TOKEN", "test-uploadthing-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a Clerk-id receipt for the route, uploader and URL it was minted for", () => {
    const receipt = signUploadReceipt("imageUploader", CLERK_ID, OWN_URL);

    expect(
      verifyUploadReceipt({
        route: "imageUploader",
        uploaderId: CLERK_ID,
        imageUrl: OWN_URL,
        receipt,
      }),
    ).toBe(true);
    expect(
      verifyUploadReceipt({
        route: "imageUploader",
        uploaderId: "user_other",
        imageUrl: OWN_URL,
        receipt,
      }),
    ).toBe(false);
  });

  it("never verifies a receipt for a route other than the one that signed it", () => {
    const profilePicture = signUploadReceipt("profilePicture", 7, OWN_URL);
    const imageUploader = signUploadReceipt("imageUploader", 7, OWN_URL);

    expect(profilePicture).not.toBe(imageUploader);
    expect(
      verifyUploadReceipt({
        route: "imageUploader",
        uploaderId: 7,
        imageUrl: OWN_URL,
        receipt: profilePicture,
      }),
    ).toBe(false);
    expect(
      verifyUploadReceipt({
        route: "profilePicture",
        uploaderId: 7,
        imageUrl: OWN_URL,
        receipt: imageUploader,
      }),
    ).toBe(false);
  });
});
