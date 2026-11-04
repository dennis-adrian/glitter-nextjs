import { getImpersonation } from "@/app/lib/impersonation/viewer";

/**
 * Whether this browser is viewing the app as a participant, for the banner
 * on pages rendered without a request (the `force-static` program pages)
 * and for its expiry check (docs/PLAN-impersonation.md §7.4). Only the
 * admin who is viewing ever gets an answer other than `active: false`.
 */
export async function GET() {
  let view: Awaited<ReturnType<typeof getImpersonation>>;
  try {
    view = await getImpersonation();
  } catch {
    // Not "no view": the banner must not say a view ended that may be on.
    return Response.json(
      { error: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const body = view
    ? {
        active: true as const,
        secondsLeft: view.secondsLeft,
        subject: {
          id: view.subject.id,
          displayName: view.subject.displayName,
          firstName: view.subject.firstName,
          lastName: view.subject.lastName,
          email: view.subject.email,
          imageUrl: view.subject.imageUrl,
        },
      }
    : { active: false as const };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
