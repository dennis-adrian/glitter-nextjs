import { expireAbandonedHolds } from "@/app/lib/programs/scheduled-actions";

export async function GET() {
  try {
    const { expired, purchaseIds } = await expireAbandonedHolds();

    return new Response(JSON.stringify({ data: { expired, purchaseIds } }), {
      status: 200,
    });
  } catch (error) {
    console.error("Error expiring abandoned program holds", error);
    return new Response(
      JSON.stringify({ error: "Error expiring abandoned program holds" }),
      { status: 500 },
    );
  }
}
