import { cleanupExpiredHolds } from "@/app/lib/stands/hold-actions";
import { db } from "@/db";
import { stands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  sectorId: z.coerce.number().int().positive(),
});

let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const STAND_STATUS_CACHE_SECONDS = 1;

type StandStatusRow = Pick<typeof stands.$inferSelect, "id" | "status">;

const getCachedSectorStandStatuses = unstable_cache(
  async (sectorId: number): Promise<StandStatusRow[]> =>
    db
      .select({ id: stands.id, status: stands.status })
      .from(stands)
      .where(eq(stands.festivalSectorId, sectorId)),
  ["sector-stand-statuses"],
  { revalidate: STAND_STATUS_CACHE_SECONDS },
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    sectorId: searchParams.get("sectorId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  // Throttled cleanup: run at most once every 2 minutes (fire-and-forget)
  const now = Date.now();
  if (now - lastCleanupTime > CLEANUP_INTERVAL_MS) {
    lastCleanupTime = now;
    cleanupExpiredHolds().catch(console.error);
  }

  // Return lightweight stand statuses for the sector. A stand with a hidden
  // reservation is genuinely reserved, so its real status is reported here;
  // only the reservation's identity is withheld (at the data layer) until the
  // reveal time passes.
  const sectorStands = await getCachedSectorStandStatuses(parsed.data.sectorId);

  return NextResponse.json({
    stands: sectorStands,
    timestamp: Date.now(),
  });
}
