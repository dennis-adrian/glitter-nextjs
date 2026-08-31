import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import {
  STAND_STATUS_RATE_LIMIT,
  authorizeStandStatusPoll,
  buildStandStatusPollResult,
} from "@/app/lib/stands/status-poll";
import {
  getFestivalSectorForStatus,
  hasAcceptedFestivalEnrollment,
  loadSectorStandStatusRows,
} from "@/app/lib/stands/status-service";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const QuerySchema = z.object({
  sectorId: z.coerce.number().int().positive(),
});

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const actor = await getCurrentUserProfile();
  if (!actor) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    sectorId: searchParams.get("sectorId"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters" },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const sector = await getFestivalSectorForStatus(parsed.data.sectorId);
  if (!sector) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  const enrolled =
    sector.festivalId != null
      ? await hasAcceptedFestivalEnrollment(actor.id, sector.festivalId)
      : false;
  const auth = authorizeStandStatusPoll({
    actor: { id: actor.id, role: actor.role, status: actor.status },
    enrolled,
  });
  if (auth === "forbidden") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 403, headers: PRIVATE_NO_STORE },
    );
  }

  const allowed = await consumeActionRateLimit({
    key: `${STAND_STATUS_RATE_LIMIT.keyPrefix}${actor.id}`,
    limit: STAND_STATUS_RATE_LIMIT.limit,
    windowMs: STAND_STATUS_RATE_LIMIT.windowMs,
  }).catch(() => false);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { ...PRIVATE_NO_STORE, "Retry-After": "5" },
      },
    );
  }

  const version = Date.now();
  const rows = await loadSectorStandStatusRows(parsed.data.sectorId, new Date());
  const payload = buildStandStatusPollResult({
    ...rows,
    version,
  });

  return NextResponse.json(payload, { headers: PRIVATE_NO_STORE });
}
