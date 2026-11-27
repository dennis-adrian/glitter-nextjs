import fs from "node:fs";
import path from "node:path";
import { djb2Hash } from "next/dist/shared/lib/hash";
import { describe, expect, it } from "vitest";

import { LEGACY_SHARE_IMAGE_ROUTES } from "@/app/lib/share-image-routes";

/** The suffix Next gives an image route in `folder` (getMetadataRouteSuffix). */
const suffixOf = (folder: string) =>
  djb2Hash(`/${folder}`).toString(36).slice(0, 6);

describe("LEGACY_SHARE_IMAGE_ROUTES", () => {
  it.each(LEGACY_SHARE_IMAGE_ROUTES)(
    "sends $source to where $folder serves its image now",
    ({ folder, source, destination }) => {
      const file = path.join(
        process.cwd(),
        "app",
        folder,
        "opengraph-image.tsx",
      );
      expect(fs.existsSync(file), file).toBe(true);
      expect(destination).toMatch(
        new RegExp(`/opengraph-image-${suffixOf(folder)}$`),
      );
      expect(source).not.toBe(destination);
    },
  );

  it("knows the suffixes from before the move", () => {
    // The folders on develop before the (site) group.
    expect(suffixOf("(routes)/voluntarios")).toBe("1tikjg");
    expect(suffixOf("(routes)/(storefront)/merch/collections/[slug]")).toBe(
      "17ro6i",
    );
  });
});
