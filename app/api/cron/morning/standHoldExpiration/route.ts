import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { cleanupExpiredHolds } from "@/app/lib/reservations/hold-service";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const result = await cleanupExpiredHolds();
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  } catch (error) {
    console.error("Error expiring stand holds", error);
    return new Response(
      JSON.stringify({ error: "Error expiring stand holds" }),
      { status: 500 },
    );
  }
}
