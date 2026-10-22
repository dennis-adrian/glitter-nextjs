import { readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ICON_BACKGROUND } from "@/app/lib/theme-colors";

const envLabel = vi.hoisted(() => ({ value: "" }));

vi.mock("@/app/lib/config", () => ({
  getEnvLabel: () => envLabel.value,
}));

import manifest from "@/app/manifest";

/** Width and height from a PNG's header, without decoding it. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("the web app manifest", () => {
  beforeEach(() => {
    envLabel.value = "";
  });

  it("opens Glitter full screen from its own start page", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      name: "Glitter",
      short_name: "Glitter",
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "es",
    });
  });

  it("names a staging install after its environment, as page titles do", () => {
    envLabel.value = "[Prev]";
    expect(manifest()).toMatchObject({
      name: "[Prev] Glitter",
      short_name: "[Prev] Glitter",
    });
  });

  it("offers the 192 and 512 icons Chrome needs, and a maskable one", () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((icon) => `${icon.purpose} ${icon.sizes}`).sort()).toEqual(
      ["any 192x192", "any 512x512", "maskable 512x512"],
    );
  });

  it("points every icon at a PNG of the size it declares", () => {
    for (const icon of manifest().icons ?? []) {
      const file = path.join(process.cwd(), "public", icon.src);
      expect(pngSize(file), icon.src).toBe(icon.sizes);
    }
  });

  it("opens on the brand purple, as the icons are drawn", async () => {
    expect(manifest()).toMatchObject({
      background_color: ICON_BACKGROUND,
      theme_color: ICON_BACKGROUND,
    });
    for (const icon of manifest().icons ?? []) {
      const corner = await sharp(path.join(process.cwd(), "public", icon.src))
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      expect(`#${corner.toString("hex")}`, icon.src).toBe(ICON_BACKGROUND);
    }
  });

  it("keeps the maskable icon's artwork inside the circle Android always shows", async () => {
    const maskable = manifest().icons?.find(
      (icon) => icon.purpose === "maskable",
    );
    const { data, info } = await sharp(
      path.join(process.cwd(), "public", maskable?.src ?? ""),
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centre = info.width / 2;
    let farthest = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        // Any pixel lighter than the purple's green channel is artwork.
        const green = data[(y * info.width + x) * info.channels + 1];
        if (green > 0x40) {
          farthest = Math.max(
            farthest,
            Math.hypot(x + 0.5 - centre, y + 0.5 - centre),
          );
        }
      }
    }
    // The safe zone is a circle 80% of the icon's width across.
    expect(farthest / info.width).toBeLessThan(0.4);
  });
});
