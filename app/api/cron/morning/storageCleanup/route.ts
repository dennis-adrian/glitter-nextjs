import { processPendingStorageCleanupJobs } from "@/app/lib/uploadthing/actions";

export async function GET() {
  try {
    const result = await processPendingStorageCleanupJobs();
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  } catch (error) {
    console.error("Error processing storage cleanup jobs", error);
    return new Response(
      JSON.stringify({ error: "Error processing storage cleanup jobs" }),
      { status: 500 },
    );
  }
}
