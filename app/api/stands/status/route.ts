import { db } from "@/db";
import { festivalSectors, standHolds, stands } from "@/db/schema";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { deriveEffectiveStandStatus } from "@/app/lib/stands/effective-status";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { and, eq, gt, inArray } from "drizzle-orm";
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

  const now = new Date();
  const sectorStands = await db
    .select({
      standId: stands.id,
      storedStatus: stands.status,
      updatedAt: stands.updatedAt,
    })
    .from(stands)
    .where(eq(stands.festivalSectorId, parsed.data.sectorId));

  const standIds = sectorStands.map((stand) => stand.standId);
  const activeHoldRows =
    standIds.length === 0
      ? []
      : await db
          .select({ standId: standHolds.standId })
          .from(standHolds)
          .where(
            and(
              inArray(standHolds.standId, standIds),
              gt(standHolds.expiresAt, now),
            ),
          );
  const activeHoldStandIds = new Set(
    activeHoldRows.map((hold) => hold.standId),
  );

  const standsWithEffectiveStatus = sectorStands.map((stand) => {
    const effectiveStatus = deriveEffectiveStandStatus(
      stand.storedStatus,
      stand.standId,
      activeHoldStandIds,
    );
    return {
      id: stand.standId,
      status: effectiveStatus,
      standId: stand.standId,
      effectiveStatus,
      updatedAt: stand.updatedAt,
    };
  });

  const availableCount = standsWithEffectiveStatus.filter(
    (stand) => stand.effectiveStatus === "available",
  ).length;

  return NextResponse.json(
    {
      stands: standsWithEffectiveStatus,
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
