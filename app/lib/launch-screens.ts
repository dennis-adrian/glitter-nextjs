/**
 * The launch screens iPhones and iPads show while an installed Glitter opens:
 * the isotype on the brand purple, full screen. No imports, so
 * InstalledAppHead and `scripts/generate-app-images.ts` share it.
 *
 * iOS builds nothing from the manifest. It shows an `apple-touch-startup-image`
 * only when its media query matches the screen exactly and the image is the
 * screen's exact pixel size, and a blank white screen otherwise. So every
 * screen size needs its own pair of images, and a new iPhone size needs a row
 * here. Sizes from Apple's specs and pwa-asset-generator's device data
 * (2026-09). The image is captured when Glitter is added to the home screen:
 * an existing install keeps the old one until it is added again. Sizes are
 * the ones Safari reports (`screen.width` and `height`, in points), not the
 * panel's pixels divided by three: the 12 and 13 mini report 375 x 812.
 * Display Zoom sizes are not listed, so a zoomed iPhone opens on white.
 *
 * Android builds its own from the manifest's purple and icon.
 */

type Screen = {
  /** Portrait size in CSS pixels, as the media query states it. */
  width: number;
  height: number;
  pixelRatio: 2 | 3;
  devices: string;
};

export const APPLE_SCREENS: readonly Screen[] = [
  { width: 375, height: 667, pixelRatio: 2, devices: "iPhone 8, SE 2 and 3" },
  { width: 414, height: 736, pixelRatio: 3, devices: "iPhone 8 Plus" },
  {
    width: 375,
    height: 812,
    pixelRatio: 3,
    devices: "iPhone X, XS, 11 Pro, 12 and 13 mini",
  },
  { width: 414, height: 896, pixelRatio: 2, devices: "iPhone XR, 11" },
  {
    width: 414,
    height: 896,
    pixelRatio: 3,
    devices: "iPhone XS Max, 11 Pro Max",
  },
  {
    width: 390,
    height: 844,
    pixelRatio: 3,
    devices: "iPhone 12 to 14, 16e, 17e",
  },
  {
    width: 428,
    height: 926,
    pixelRatio: 3,
    devices: "iPhone 12 and 13 Pro Max, 14 Plus",
  },
  {
    width: 393,
    height: 852,
    pixelRatio: 3,
    devices: "iPhone 14 Pro, 15, 15 Pro, 16",
  },
  {
    width: 430,
    height: 932,
    pixelRatio: 3,
    devices: "iPhone 14 and 15 Pro Max, 15 and 16 Plus",
  },
  {
    width: 402,
    height: 874,
    pixelRatio: 3,
    devices: "iPhone 16 Pro, 17, 17 Pro, 18 Pro",
  },
  {
    width: 440,
    height: 956,
    pixelRatio: 3,
    devices: "iPhone 16, 17 and 18 Pro Max",
  },
  { width: 420, height: 912, pixelRatio: 3, devices: "iPhone Air" },
  {
    width: 744,
    height: 1133,
    pixelRatio: 2,
    devices: "iPad mini 6 and A17 Pro",
  },
  {
    width: 768,
    height: 1024,
    pixelRatio: 2,
    devices: 'iPad 5 and 6, mini 5, Pro 9.7"',
  },
  { width: 810, height: 1080, pixelRatio: 2, devices: "iPad 7 to 9" },
  {
    width: 820,
    height: 1180,
    pixelRatio: 2,
    devices: 'iPad Air 4 and later 11", iPad 10 and A16',
  },
  { width: 834, height: 1112, pixelRatio: 2, devices: 'iPad Pro 10.5", Air 3' },
  {
    width: 834,
    height: 1194,
    pixelRatio: 2,
    devices: 'iPad Pro 11" 1st to 4th gen',
  },
  {
    width: 834,
    height: 1210,
    pixelRatio: 2,
    devices: 'iPad Pro 11" M4 and M5',
  },
  {
    width: 1024,
    height: 1366,
    pixelRatio: 2,
    devices: 'iPad Pro 12.9", Air 13"',
  },
  {
    width: 1032,
    height: 1376,
    pixelRatio: 2,
    devices: 'iPad Pro 13" M4 and M5',
  },
];

export type LaunchScreen = {
  /** Image size in device pixels. */
  width: number;
  height: number;
  /** Artwork width in device pixels; see `launchArtworkWidth`. */
  artworkWidth: number;
  url: string;
  media: string;
};

/**
 * The isotype is 36% of the shorter side wide on phones (about the size of
 * Android's own launch icon), and at most 240 points on an iPad, where 36%
 * would read as a poster. The same in either orientation, so rotating the
 * device does not resize it.
 */
const ARTWORK_SHARE_OF_SHORT_SIDE = 0.36;
const MAX_ARTWORK_POINTS = 240;

function launchArtworkWidth(screen: Screen) {
  const points = Math.min(
    ARTWORK_SHARE_OF_SHORT_SIDE * Math.min(screen.width, screen.height),
    MAX_ARTWORK_POINTS,
  );
  return Math.round(points * screen.pixelRatio);
}

/** One image per screen and orientation; both are drawn the same way. */
export const LAUNCH_SCREENS: readonly LaunchScreen[] = APPLE_SCREENS.flatMap(
  (screen) =>
    (["portrait", "landscape"] as const).map((orientation) => {
      const long = Math.max(screen.width, screen.height) * screen.pixelRatio;
      const short = Math.min(screen.width, screen.height) * screen.pixelRatio;
      const width = orientation === "portrait" ? short : long;
      const height = orientation === "portrait" ? long : short;
      return {
        width,
        height,
        artworkWidth: launchArtworkWidth(screen),
        url: `/splash/apple-splash-${width}x${height}.png`,
        // The media query always states the portrait size; only
        // `orientation` changes.
        media: `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.pixelRatio}) and (orientation: ${orientation})`,
      };
    }),
);
