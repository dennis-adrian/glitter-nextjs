import { installedAppName } from "@/app/lib/installable-app";
import { LAUNCH_SCREENS } from "@/app/lib/launch-screens";

/**
 * The tags that let browsers install Glitter and set how it opens once
 * installed: the manifest, the iPhone home-screen icon, full screen and the
 * launch screens.
 *
 * They are not in the root layout's `metadata`, because Next streams a page's
 * metadata into <body> when the page has an async `generateMetadata` (the
 * home page does), and browsers read these only from <head>. React moves
 * these tags into <head> when they render before its first bytes go out, so
 * the root layout renders them itself, ahead of anything that waits for data.
 *
 * Next still adds its own manifest link for app/manifest.ts: in <head> on
 * pages whose metadata is not streamed, in <body> on the rest. Browsers use
 * whichever comes first in <head>; both name the same file and, on a
 * preview, both send cookies.
 */
export default function InstalledAppHead() {
  return (
    <>
      {/* With cookies, so a preview behind Vercel's login can serve it, as
          Next's own link does there. */}
      <link
        rel="manifest"
        href="/manifest.webmanifest"
        crossOrigin="use-credentials"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/glitter-apple-180.png"
        sizes="180x180"
      />
      <meta name="mobile-web-app-capable" content="yes" />
      {/* iOS shows launch screens only with this older name. */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content={installedAppName()} />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      {LAUNCH_SCREENS.map((screen) => (
        <link
          key={screen.url}
          rel="apple-touch-startup-image"
          href={screen.url}
          media={screen.media}
        />
      ))}
    </>
  );
}
