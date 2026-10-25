import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { INSTALLED_APP_SIGN_IN_HREF } from "@/app/components/landing/installed-app";
import { PORTAL_HREF } from "@/app/components/navbar/app-navigation";

/**
 * The installed app's start page (the manifest's `start_url`). People who
 * install Glitter are participants and visitors with an account, so opening
 * it never shows the marketing landing: a session goes to its portal, anyone
 * else to sign in.
 *
 * It answers on the server, so a cold start is one redirect with nothing
 * painted in between.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  const destination = userId ? PORTAL_HREF : INSTALLED_APP_SIGN_IN_HREF;

  return NextResponse.redirect(new URL(destination, request.url));
}
