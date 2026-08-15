import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import {
  expireAbandonedHolds,
  expireStaleCorrections,
} from "@/app/lib/fast-pass/scheduled-actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const [holds, corrections] = await Promise.all([
      expireAbandonedHolds(),
      expireStaleCorrections(),
    ]);

    return new Response(
      JSON.stringify({
        data: {
          expired: holds.expired,
          expiredCorrections: corrections.expired,
        },
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error expiring abandoned FastPass holds", error);
    return new Response(
      JSON.stringify({ error: "Error expiring abandoned FastPass holds" }),
      { status: 500 },
    );
  }
}
