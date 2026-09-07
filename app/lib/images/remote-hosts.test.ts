import { describe, expect, it } from "vitest";

import { isAllowedRemoteImageHost } from "./remote-hosts";

describe("isAllowedRemoteImageHost", () => {
  it.each([
    "img.clerk.com",
    "files.edgestore.dev",
    "utfs.io",
    "ufs.sh",
    "glitter.ufs.sh",
  ])("allows configured remote image host %s", (hostname) => {
    expect(isAllowedRemoteImageHost(hostname)).toBe(true);
  });

  it.each(["example.com", "instagram.com", "evil.ufs.sh.evil"])(
    "rejects unconfigured host %s",
    (hostname) => {
      expect(isAllowedRemoteImageHost(hostname)).toBe(false);
    },
  );
});
