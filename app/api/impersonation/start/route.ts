import { cookies } from "next/headers";

import { isSameOriginRequest } from "@/app/lib/impersonation/same-origin";
import { startImpersonation } from "@/app/lib/impersonation/start";

/**
 * "Entrar como participante": starts a read-only view of the app as a
 * participant (docs/PLAN-impersonation.md §5.1). The client then loads
 * `redirectTo` as a whole new document.
 *
 * Same-origin only, like Salir: another site must not be able to start a
 * view in an admin's browser.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { success: false, message: "No autorizado" },
      { status: 403 },
    );
  }

  let input: unknown = null;
  try {
    input = await request.json();
  } catch {
    // Validated below like any other bad input.
  }

  const result = await startImpersonation(input, await cookies());
  return Response.json(result, {
    status: result.success ? 200 : 400,
    headers: { "Cache-Control": "no-store" },
  });
}
