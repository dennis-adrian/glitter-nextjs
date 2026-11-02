import { cookies } from "next/headers";

import { exitImpersonation } from "@/app/lib/impersonation/exit";

/**
 * Salir: ends the view of the app as a participant and answers where the
 * admin goes next (docs/PLAN-impersonation.md §5.3). The banner posts here
 * and then loads `returnTo` as a whole new document.
 *
 * Same-origin only: another site could otherwise end a view by posting a
 * form here.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let reason: "exited" | "signed_out" = "exited";
  try {
    const body = (await request.json()) as { reason?: unknown } | null;
    if (body?.reason === "signed_out") reason = "signed_out";
  } catch {
    // No body: a plain Salir.
  }

  const { returnTo } = await exitImpersonation(await cookies(), reason);
  return Response.json(
    { returnTo },
    { headers: { "Cache-Control": "no-store" } },
  );
}
