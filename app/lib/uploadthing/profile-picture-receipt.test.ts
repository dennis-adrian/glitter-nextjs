import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  signProfilePictureUpload,
  verifyProfilePictureUpload,
} from "@/app/lib/uploadthing/profile-picture-receipt";

const OWN_URL = "https://app.ufs.sh/f/own-key";
const OTHER_URL = "https://app.ufs.sh/f/someone-elses-key";

describe("profile picture upload receipts", () => {
  beforeEach(() => {
    vi.stubEnv("UPLOADTHING_TOKEN", "test-uploadthing-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a receipt for the uploader and the URL it was minted for", () => {
    const receipt = signProfilePictureUpload(7, OWN_URL);

    expect(
      verifyProfilePictureUpload({ uploaderId: 7, imageUrl: OWN_URL, receipt }),
    ).toBe(true);
  });

  it("rejects the receipt for anyone other than the uploader", () => {
    const receipt = signProfilePictureUpload(7, OWN_URL);

    expect(
      verifyProfilePictureUpload({ uploaderId: 8, imageUrl: OWN_URL, receipt }),
    ).toBe(false);
  });

  it("rejects the receipt for any other URL", () => {
    const receipt = signProfilePictureUpload(7, OWN_URL);

    expect(
      verifyProfilePictureUpload({
        uploaderId: 7,
        imageUrl: OTHER_URL,
        receipt,
      }),
    ).toBe(false);
  });

  it.each([undefined, null, "", "not-a-receipt", 42])(
    "rejects a missing or malformed receipt (%s)",
    (receipt) => {
      expect(
        verifyProfilePictureUpload({
          uploaderId: 7,
          imageUrl: OWN_URL,
          receipt,
        }),
      ).toBe(false);
    },
  );

  it("rejects a receipt signed under a different token", () => {
    const receipt = signProfilePictureUpload(7, OWN_URL);
    vi.stubEnv("UPLOADTHING_TOKEN", "rotated-token");

    expect(
      verifyProfilePictureUpload({ uploaderId: 7, imageUrl: OWN_URL, receipt }),
    ).toBe(false);
  });

  it("refuses to sign or verify without a token", () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "");

    expect(() => signProfilePictureUpload(7, OWN_URL)).toThrow(
      /UPLOADTHING_TOKEN/,
    );
  });
});
