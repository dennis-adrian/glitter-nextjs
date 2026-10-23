/**
 * Draws the images an installed Glitter shows from the isotype's SVG source
 * (public/img/logo/glitter-isotype.svg): the home-screen icons, the iPhone
 * and iPad launch screens and the notification badge. Run after changing the
 * logo, the purple or the launch-screen list, and commit what it writes:
 *
 *   pnpm app-images
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { LAUNCH_SCREENS } from "../app/lib/launch-screens";
import { ICON_BACKGROUND } from "../app/lib/theme-colors";

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "public/img/logo/glitter-isotype.svg");
const SPLASH_DIR = path.join(ROOT, "public/splash");

/**
 * The artwork's bounding box in SVG units (the G and the sparkle together),
 * and the point the designer centred it on: the middle of the 114 x 115
 * frame. The box sits 3 units to the right of that on purpose, so the G's
 * weight reads centred; placing by the box would push it left.
 */
const ARTWORK_BOX = { left: 15.646, top: 19.24, right: 104.33, bottom: 95.761 };
const ARTWORK_WIDTH = ARTWORK_BOX.right - ARTWORK_BOX.left;
const DESIGN_CENTRE = { x: 57, y: 57.5 };
const BOX_CENTRE = {
  x: (ARTWORK_BOX.left + ARTWORK_BOX.right) / 2,
  y: (ARTWORK_BOX.top + ARTWORK_BOX.bottom) / 2,
};

/**
 * The notification badge Android shows in the status bar: only its alpha
 * counts, so white on transparent. The artwork fills the 20 of the icon's 24
 * dp it may use, centred by its box, as the sparkle would otherwise reach
 * into the margin.
 */
const BADGE = {
  file: "public/icons/glitter-badge-96.png",
  size: 96,
  artwork: 80,
};

/**
 * Icons: the artwork is 0.6875 of the icon's width, which keeps its farthest
 * point (the sparkle's tip) at 0.378 of the width from the centre, inside the
 * 0.40 circle a maskable icon promises to show. So one file is both the
 * regular and the maskable icon.
 */
const ICON_ARTWORK_SHARE = 0.6875;

/** The white paths, without the source's purple background or styles. */
function artworkPaths(svg: string) {
  const paths = [
    ...svg.matchAll(/<path\b[^>]*\bclass="cls-2"[^>]*\bd="([^"]+)"/g),
  ].map((match) => match[1]);
  if (paths.length !== 2) {
    throw new Error(
      `Expected the G and the sparkle, found ${paths.length} paths`,
    );
  }
  return paths;
}

/**
 * The artwork, `artworkWidth` wide, on a `width` x `height` canvas, with its
 * `centre` (the designer's, unless given) in the middle.
 */
function canvasSvg(
  paths: string[],
  {
    width,
    height,
    artworkWidth,
    background,
    centre = DESIGN_CENTRE,
  }: {
    width: number;
    height: number;
    artworkWidth: number;
    background: string | null;
    centre?: { x: number; y: number };
  },
) {
  const scale = artworkWidth / ARTWORK_WIDTH;
  const x = width / 2 - centre.x * scale;
  const y = height / 2 - centre.y * scale;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      (background
        ? `<rect width="${width}" height="${height}" fill="${background}"/>`
        : "") +
      `<g transform="translate(${x} ${y}) scale(${scale})" fill="#fff">` +
      paths.map((d) => `<path d="${d}"/>`).join("") +
      `</g></svg>`,
  );
}

/**
 * An opaque PNG, written with a palette when that loses nothing: a flat
 * purple with white artwork has under 256 colours, and the palette file is a
 * fifth to a half of the size. Written as encoded: handing it back to sharp
 * would encode it again, without the palette.
 */
async function writeOpaquePng(svg: Buffer, file: string) {
  const rgb = await sharp(svg).removeAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { width, height } = rgb.info;
  const source = () => sharp(rgb.data, { raw: { width, height, channels: 3 } });

  const palette = await source()
    .png({ palette: true, colours: 256, dither: 0, effort: 10 })
    .toBuffer();
  const roundTrip = await sharp(palette).removeAlpha().raw().toBuffer();
  const output = roundTrip.equals(rgb.data)
    ? palette
    : await source().png({ compressionLevel: 9 }).toBuffer();

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, output);
  return output.length;
}

async function main() {
  const paths = artworkPaths(readFileSync(SOURCE, "utf8"));
  const written: string[] = [];

  const icons = [
    { file: "public/icons/glitter-192.png", size: 192 },
    { file: "public/icons/glitter-512.png", size: 512 },
    { file: "public/icons/glitter-apple-180.png", size: 180 },
  ];
  for (const { file, size } of icons) {
    const svg = canvasSvg(paths, {
      width: size,
      height: size,
      artworkWidth: size * ICON_ARTWORK_SHARE,
      background: ICON_BACKGROUND,
    });
    const bytes = await writeOpaquePng(svg, path.join(ROOT, file));
    written.push(`${file} (${bytes} B)`);
  }

  const badge = await sharp(
    canvasSvg(paths, {
      width: BADGE.size,
      height: BADGE.size,
      artworkWidth: BADGE.artwork,
      background: null,
      centre: BOX_CENTRE,
    }),
  )
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(path.join(ROOT, BADGE.file), badge);
  written.push(`${BADGE.file} (${badge.length} B)`);

  // Start clean, so a size dropped from the list does not linger.
  rmSync(SPLASH_DIR, { recursive: true, force: true });
  let splashBytes = 0;
  for (const screen of LAUNCH_SCREENS) {
    const svg = canvasSvg(paths, { ...screen, background: ICON_BACKGROUND });
    splashBytes += await writeOpaquePng(
      svg,
      path.join(ROOT, "public", screen.url),
    );
  }
  written.push(
    `public/splash: ${readdirSync(SPLASH_DIR).length} launch screens (${splashBytes} B)`,
  );

  console.info(written.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
