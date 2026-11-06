import { COMUNICADOS_CRON_DEADLINE_MS } from "@/app/lib/comunicados/definitions";
import { runComunicadoWork } from "@/app/lib/comunicados/driver";
import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";

/**
 * Every minute (docs/IMPLEMENTATION-comunicados.md D9): the comunicados lane,
 * for this environment's campaigns. A cron of its own, so bulk work never
 * shares the notifications cron's budget or pass order (D4).
 *
 * It does not read the comunicados flag (G2): hiding the flag only removes
 * the admin pages, and what was already sent keeps going out. A failing step
 * is logged and reported in the body's `failedSteps`; only a run that cannot
 * start answers 500. `vercel.json` gives it 100 s; the run ends by 75 s.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const result = await runComunicadoWork({
      scope: "lane",
      deadline: Date.now() + COMUNICADOS_CRON_DEADLINE_MS,
      trigger: "cron",
    });
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  } catch (error) {
    // The type only: a query error's message carries its params.
    console.error("Error processing comunicados", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return new Response(
      JSON.stringify({ error: "Error processing comunicados" }),
      { status: 500 },
    );
  }
}
