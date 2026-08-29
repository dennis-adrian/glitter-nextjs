import { db } from "@/db";
import { festivalSectors, stands } from "@/db/schema";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  sectorId: z.coerce.number().int().positive(),
});

export async function GET(request: NextRequest) {
  const actor = await getCurrentUserProfile();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    sectorId: searchParams.get("sectorId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const sector = await db.query.festivalSectors.findFirst({
    where: eq(festivalSectors.id, parsed.data.sectorId),
    columns: { id: true, festivalId: true },
  });
  if (!sector) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canViewAdminReservationData({ id: actor.id, role: actor.role })) {
    if (actor.status !== "verified") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  const sectorStands = await db
    .select({
      standId: stands.id,
      effectiveStatus: stands.status,
      updatedAt: stands.updatedAt,
    })
    .from(stands)
    .where(eq(stands.festivalSectorId, parsed.data.sectorId));

  const availableCount = sectorStands.filter(
    (stand) => stand.effectiveStatus === "available",
  ).length;

  return NextResponse.json(
    {
      stands: sectorStands.map((stand) => ({
        id: stand.standId,
        status: stand.effectiveStatus,
        standId: stand.standId,
        effectiveStatus: stand.effectiveStatus,
        updatedAt: stand.updatedAt,
      })),
      availableCount,
      timestamp: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
