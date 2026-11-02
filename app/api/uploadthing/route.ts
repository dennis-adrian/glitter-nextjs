import { createRouteHandler } from "uploadthing/next";

import { IMPERSONATION_READ_ONLY_MESSAGE } from "@/app/lib/impersonation/definitions";
import { isImpersonating } from "@/app/lib/impersonation/viewer";

import { ourFileRouter } from "./core";

const handlers = createRouteHandler({
  router: ourFileRouter,

  // Apply an (optional) custom config:
  // config: { ... },
});

export const { GET } = handlers;

/**
 * Nothing is uploaded while an admin views the app as a participant
 * (docs/PLAN-impersonation.md §6.2). Refused here, on the person's own
 * request: several routes' `onUploadComplete` write to the database from
 * UploadThing's callback, which carries no cookie, so the database guard
 * could never see the view there. That callback passes: it has no view
 * cookie, so `isImpersonating` is false for it.
 */
export async function POST(request: Request) {
  if (await isImpersonating()) {
    return Response.json(
      {
        error: IMPERSONATION_READ_ONLY_MESSAGE,
        message: IMPERSONATION_READ_ONLY_MESSAGE,
      },
      { status: 403 },
    );
  }
  return handlers.POST(request as Parameters<typeof handlers.POST>[0]);
}
