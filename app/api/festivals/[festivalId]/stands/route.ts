import { isReservationHidden } from "@/app/lib/reservations/reveal";
import { withMembershipReservations } from "@/app/lib/reservations/stand-occupancy";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { db } from "@/db";
import { profileSubcategories, stands, standReservations } from "@/db/schema";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:5273",
  "https://game.glitter.com.bo",
];

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowed != null && { "Access-Control-Allow-Origin": allowed }),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // The allowed origin is echoed per request, so a shared cache must key on it.
    Vary: "Origin",
  };
}

// Many visitors open the game at once; let the CDN answer most of them.
const SUCCESS_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * While a reservation is still hidden, the cached copy carries its empty
 * participant list, so it must expire by the reveal: no stale-while-revalidate,
 * and a lifetime no longer than the time left until the earliest reveal.
 */
function successCacheControl(nextRevealAt: Date | null, now: Date): string {
  if (nextRevealAt == null) return SUCCESS_CACHE_CONTROL;
  const secondsLeft = Math.floor(
    (nextRevealAt.getTime() - now.getTime()) / 1000,
  );
  if (secondsLeft <= 0) return "no-store";
  return `public, s-maxage=${Math.min(60, secondsLeft)}`;
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

type FestivalStand = {
  standId: number;
  standLabel: string | null;
  standNumber: number;
  standDisplayLabel: string;
  status: (typeof stands.$inferSelect)["status"];
  standCategory: (typeof stands.$inferSelect)["standCategory"];
  // When set and in the future, the reservation on this stand is still hidden
  // from participants: the client should withhold it until this moment.
  revealAt: string | null;
  // Set when a visible reservation on this stand occupies exactly two stands
  // (a full table): the other half. Null while that reservation is hidden, so
  // a timed reveal does not leak that two stands are booked together.
  fullTable: { partnerStandId: number; partnerStandLabel: string } | null;
  participants: {
    participantId: number;
    imageUrl: string | null;
    displayName: string | null;
    category: string | null;
    // Labels of the participant's profile subcategories.
    subcategories: string[];
    socials: {
      type: string;
      username: string;
    }[];
  }[];
};

type ResponseBody = {
  stands: FestivalStand[];
  error?: string;
};

const ParamsSchema = z.object({
  festivalId: z.coerce.number().int().positive(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ festivalId: string }> },
): Promise<NextResponse<ResponseBody>> {
  const parsed = ParamsSchema.safeParse(await params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid festival ID", stands: [] },
      { status: 400, headers: getCorsHeaders(request) },
    );
  }

  const { festivalId } = parsed.data;

  const now = new Date();
  let occupiedStands;
  let standIdsByReservationId;
  let subcategoriesByUserId;
  try {
    const festivalStands = await db.query.stands.findMany({
      where: eq(stands.festivalId, festivalId),
      with: {
        // The nested reservation is fetched under its own short alias:
        // Postgres truncates identifiers at 63 bytes, and a deeper chain
        // here collides `_participants` with `_participants_user`.
        reservations: {
          // Include accepted reservations plus active admin timed reservations
          // (non-terminal + revealAt), so the game can reveal them itself.
          // Rejected/canceled timed reservations must not leak through revealAt alone.
          where: or(
            eq(standReservations.status, "accepted"),
            and(
              isNotNull(standReservations.revealAt),
              inArray(standReservations.status, [
                "pending",
                "verification_payment",
              ]),
            ),
          ),
          with: {
            participants: {
              with: {
                user: {
                  with: {
                    userSocials: true,
                  },
                },
              },
            },
          },
        },
        // Flat membership; joined to the reservations above in memory.
        reservationMembers: true,
      },
    });
    standIdsByReservationId = indexActiveMemberStands(festivalStands);
    occupiedStands = withMembershipReservations(festivalStands).map(
      (stand) => ({
        ...stand,
        // Withhold participant identity until revealAt; revealAt itself is
        // still sent so the game can schedule the reveal without receiving
        // names/images/socials early.
        visibleReservations: stand.reservations.filter(
          (reservation) => !isReservationHidden(reservation, now),
        ),
      }),
    );
    subcategoriesByUserId = await fetchSubcategoryLabels(
      occupiedStands.flatMap((stand) =>
        stand.visibleReservations.flatMap((reservation) =>
          reservation.participants.map((p) => p.user.id),
        ),
      ),
    );
  } catch (err) {
    console.error("Failed to fetch festival stands", {
      festivalId,
      error: err,
    });
    return NextResponse.json(
      { error: "Failed to load stands", stands: [] },
      { status: 500, headers: getCorsHeaders(request) },
    );
  }

  const standsById = new Map(occupiedStands.map((stand) => [stand.id, stand]));

  const result: FestivalStand[] = occupiedStands.map((stand) => ({
    standId: stand.id,
    standLabel: stand.label,
    standNumber: stand.standNumber,
    standDisplayLabel: formatStandLabel(stand),
    status: stand.status,
    standCategory: stand.standCategory,
    revealAt:
      stand.reservations
        .map((reservation) => reservation.revealAt)
        .filter((date): date is Date => date != null)
        .sort((a, b) => b.getTime() - a.getTime())[0]
        ?.toISOString() ?? null,
    fullTable: findFullTablePartner(stand, standIdsByReservationId, standsById),
    participants: stand.visibleReservations.flatMap((reservation) =>
      reservation.participants.map((p) => ({
        participantId: p.id,
        imageUrl: p.user.imageUrl,
        displayName: p.user.displayName,
        category: p.user.category,
        subcategories: subcategoriesByUserId.get(p.user.id) ?? [],
        socials: p.user.userSocials.map((s) => ({
          type: s.type,
          username: s.username,
        })),
      })),
    ),
  }));

  const nextRevealAt =
    occupiedStands
      .flatMap((stand) => stand.reservations)
      .filter((reservation) => isReservationHidden(reservation, now))
      .map((reservation) => reservation.revealAt as Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return NextResponse.json(
    { stands: result },
    {
      headers: {
        ...getCorsHeaders(request),
        "Cache-Control": successCacheControl(nextRevealAt, now),
      },
    },
  );
}

/** Stand ids each reservation occupies through its active (unreleased) members. */
function indexActiveMemberStands(
  festivalStands: readonly {
    id: number;
    reservationMembers: readonly {
      reservationId: number;
      releasedAt: Date | null;
    }[];
  }[],
): Map<number, Set<number>> {
  const standIds = new Map<number, Set<number>>();
  for (const stand of festivalStands) {
    for (const member of stand.reservationMembers) {
      if (member.releasedAt != null) continue;
      const ids = standIds.get(member.reservationId) ?? new Set<number>();
      ids.add(stand.id);
      standIds.set(member.reservationId, ids);
    }
  }
  return standIds;
}

/**
 * The other half of a full table. Only visible reservations are considered:
 * a hidden one must not reveal that two stands are booked together.
 */
function findFullTablePartner(
  stand: { id: number; visibleReservations: readonly { id: number }[] },
  standIdsByReservationId: ReadonlyMap<number, ReadonlySet<number>>,
  standsById: ReadonlyMap<
    number,
    { id: number; label: string | null; standNumber: number }
  >,
): FestivalStand["fullTable"] {
  for (const reservation of stand.visibleReservations) {
    const standIds = standIdsByReservationId.get(reservation.id);
    if (standIds?.size !== 2 || !standIds.has(stand.id)) continue;
    const partnerId = [...standIds].find((id) => id !== stand.id);
    const partner = partnerId == null ? undefined : standsById.get(partnerId);
    if (partner == null) continue;
    return {
      partnerStandId: partner.id,
      partnerStandLabel: formatStandLabel(partner),
    };
  }
  return null;
}

/**
 * Subcategory labels per user. Fetched on their own rather than nested under
 * the stands query: `user -> profileSubcategories -> subcategory` beneath
 * `reservations -> participants` pushes drizzle's aliases past Postgres's
 * 63-byte identifier limit.
 */
async function fetchSubcategoryLabels(
  userIds: number[],
): Promise<Map<number, string[]>> {
  const labels = new Map<number, string[]>();
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return labels;

  const rows = await db.query.profileSubcategories.findMany({
    where: inArray(profileSubcategories.profileId, uniqueIds),
    orderBy: profileSubcategories.id,
    with: { subcategory: { columns: { label: true } } },
  });
  for (const row of rows) {
    const list = labels.get(row.profileId) ?? [];
    list.push(row.subcategory.label);
    labels.set(row.profileId, list);
  }
  return labels;
}
