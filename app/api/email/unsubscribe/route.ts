import { NextResponse, type NextRequest } from "next/server";

import { recipientAddress, unsubscribe } from "@/app/lib/emails/suppressions";
import { UNSUBSCRIBE_PAGE_PATH } from "@/app/lib/emails/unsubscribe-links";
import { verifyUnsubscribeToken } from "@/app/lib/emails/unsubscribe-tokens";

/**
 * One-click unsubscribe (RFC 8058): the target of the List-Unsubscribe header
 * on bulk mail. Gmail, Yahoo and others POST here from their own servers when
 * the reader presses "Unsubscribe", with no cookies and no page, so the token
 * in the URL is the whole request. Answer 200 with no body and never
 * redirect.
 */
export async function POST(request: NextRequest) {
  const subject = verifyUnsubscribeToken(
    request.nextUrl.searchParams.get("token"),
  );
  if (!subject) {
    return new Response(null, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const address = await recipientAddress(subject);
    // A recipient that no longer exists has nothing left to unsubscribe.
    if (address) await unsubscribe(address, subject.topic);
  } catch (error) {
    console.error("Error processing one-click unsubscribe", error);
    return new Response(null, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * A client that opens the header's URL in a browser instead: show the page,
 * which asks before changing anything. Link scanners fetch with GET too.
 */
export async function GET(request: NextRequest) {
  const target = new URL(UNSUBSCRIBE_PAGE_PATH, request.url);
  const token = request.nextUrl.searchParams.get("token");
  if (token) target.searchParams.set("token", token);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
