import { NextResponse, type NextRequest } from "next/server";

import { INSTALLED_APP_SIGN_IN_HREF } from "@/app/components/landing/installed-app";
import { PORTAL_HREF } from "@/app/components/navbar/app-navigation";
import { isSignedIn } from "@/app/lib/impersonation/viewer";
import { INSTALLED_APP_LAUNCH_HASH } from "@/app/lib/installed-app-mode";

/**
 * The installed app's start page (the manifest's `start_url`). People who
 * install Glitter are participants and visitors with an account, so opening
 * it never shows the marketing landing: a session goes to its portal, anyone
 * else to sign in.
 *
 * It answers on the server, so a cold start is one redirect with nothing
 * painted in between. The redirect carries `#installed-app`, which tells the
 * page it opens in the installed app even on phones whose installed app
 * reports the browser's display mode (app/lib/installed-app-mode.ts). Only
 * the manifest links here, so any visit is the app's.
 */
export async function GET(request: NextRequest) {
  const destination = (await isSignedIn())
    ? PORTAL_HREF
    : INSTALLED_APP_SIGN_IN_HREF;

  return NextResponse.redirect(
    new URL(`${destination}#${INSTALLED_APP_LAUNCH_HASH}`, request.url),
  );
}
