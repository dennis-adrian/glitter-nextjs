import { NextResponse, type NextRequest } from "next/server";

import {
  openTicketHistory,
  visitorIdFromHistoryToken,
} from "@/app/lib/visitors/session";

/**
 * Where the "Ver mis entradas" link in our emails lands. Trades the signed
 * token for a cookie and moves on to a clean URL, so the token does not stay
 * in the address bar, the browser history or a referrer.
 */
export async function GET(request: NextRequest) {
  const target = new URL("/visitors/tickets", request.url);
  const visitorId = visitorIdFromHistoryToken(
    request.nextUrl.searchParams.get("token"),
  );

  if (visitorId === null) {
    target.searchParams.set("enlace", "vencido");
  } else {
    await openTicketHistory(visitorId);
  }

  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
