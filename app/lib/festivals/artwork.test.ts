import { describe, expect, it } from "vitest";

import { FESTIVAL_ARTWORK_ACCEPT } from "@/app/lib/festivals/artwork";
import { validateImage } from "@/stories/uploads/components/upload-types";

const file = (name: string, type: string) =>
  new File([new Uint8Array([1])], name, { type });

describe("festival artwork formats", () => {
  it("lets the poster and banner fields take JPEG, PNG and WebP", () => {
    for (const [name, type] of [
      ["poster.jpg", "image/jpeg"],
      ["banner.png", "image/png"],
      ["banner.webp", "image/webp"],
    ]) {
      expect(
        validateImage(
          file(name, type),
          4 * 1024 * 1024,
          FESTIVAL_ARTWORK_ACCEPT,
        ),
      ).toBeUndefined();
    }
  });

  it("still refuses SVG, which Gmail cannot show", () => {
    expect(
      validateImage(
        file("poster.svg", "image/svg+xml"),
        4 * 1024 * 1024,
        FESTIVAL_ARTWORK_ACCEPT,
      ),
    ).toBe("Usá una imagen en formato JPG, PNG o WebP.");
  });
});
