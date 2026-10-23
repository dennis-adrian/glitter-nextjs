// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { APPLE_SCREENS, LAUNCH_SCREENS } from "@/app/lib/launch-screens";
import { ICON_BACKGROUND } from "@/app/lib/theme-colors";

/** Width and height from a PNG's header, without decoding it. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const publicFile = (url: string) => path.join(process.cwd(), "public", url);

describe("the iPhone and iPad launch screens", () => {
  it("has a portrait and a landscape image for every screen", () => {
    expect(LAUNCH_SCREENS).toHaveLength(APPLE_SCREENS.length * 2);
    for (const screen of APPLE_SCREENS) {
      const size = `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.pixelRatio})`;
      const portrait = LAUNCH_SCREENS.find(
        (launch) => launch.media === `${size} and (orientation: portrait)`,
      );
      const landscape = LAUNCH_SCREENS.find(
        (launch) => launch.media === `${size} and (orientation: landscape)`,
      );
      // iOS shows an image only when it is the screen's exact pixel size.
      expect(portrait, screen.devices).toMatchObject({
        width: screen.width * screen.pixelRatio,
        height: screen.height * screen.pixelRatio,
      });
      expect(landscape, screen.devices).toMatchObject({
        width: screen.height * screen.pixelRatio,
        height: screen.width * screen.pixelRatio,
      });
    }
  });

  it("gives every image its own file", () => {
    const urls = LAUNCH_SCREENS.map((screen) => screen.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  // Fails after a change to the screen list, the purple or the artwork's
  // size until `pnpm app-images` runs again.
  it("has every image drawn at its screen's size, in the brand purple", async () => {
    await Promise.all(
      LAUNCH_SCREENS.map(async (screen) => {
        const file = publicFile(screen.url);
        expect(pngSize(file), screen.url).toEqual({
          width: screen.width,
          height: screen.height,
        });

        const [corner, isotype] = await Promise.all([
          sharp(file)
            .extract({ left: 0, top: 0, width: 1, height: 1 })
            .removeAlpha()
            .raw()
            .toBuffer(),
          // The isotype, cropped out of the purple.
          sharp(file)
            .trim({ background: ICON_BACKGROUND, threshold: 16 })
            .toBuffer({ resolveWithObject: true }),
        ]);
        expect(`#${corner.toString("hex")}`, screen.url).toBe(ICON_BACKGROUND);

        // Its size, and centred.
        const { info } = isotype;
        expect(
          Math.abs(info.width - screen.artworkWidth),
          screen.url,
        ).toBeLessThanOrEqual(2);
        const left = -(info.trimOffsetLeft ?? 0);
        const top = -(info.trimOffsetTop ?? 0);
        const tolerance = screen.artworkWidth * 0.05;
        expect(
          Math.abs(left + info.width / 2 - screen.width / 2),
          screen.url,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(top + info.height / 2 - screen.height / 2),
          screen.url,
        ).toBeLessThanOrEqual(tolerance);
      }),
    );
  }, 60_000);
});
