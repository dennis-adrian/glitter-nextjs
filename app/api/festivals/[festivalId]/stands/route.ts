import { isReservationHidden } from "@/app/lib/reservations/reveal";
import { db } from "@/db";
import { stands, standReservations } from "@/db/schema";
import { eq, isNotNull, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "https://game.glitter.com.bo",
];

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowed != null && { "Access-Control-Allow-Origin": allowed }),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
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
  // When set and in the future, the reservation on this stand is still hidden
  // from participants: the client should withhold it until this moment.
  revealAt: string | null;
  participants: {
    participantId: number;
    imageUrl: string | null;
    displayName: string | null;
    category: string | null;
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

  let festivalStands;
  try {
    festivalStands = await db.query.stands.findMany({
      where: eq(stands.festivalId, festivalId),
      with: {
        reservations: {
          // Include accepted reservations plus admin timed reservations that
          // are still (or were) hidden, so the game can reveal them itself.
          where: or(
            eq(standReservations.status, "accepted"),
            isNotNull(standReservations.revealAt),
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
      },
    });
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

  const result = festivalStands.map((stand) => ({
    standId: stand.id,
    standLabel: stand.label,
    standNumber: stand.standNumber,
    standDisplayLabel:
      stand.label != null && stand.standNumber != null
        ? `${stand.label}${stand.standNumber}`
        : "",
    revealAt:
      stand.reservations
        .map((reservation) => reservation.revealAt)
        .filter((date): date is Date => date != null)
        .sort((a, b) => b.getTime() - a.getTime())[0]
        ?.toISOString() ?? null,
    // Withhold participant identity until revealAt; keep revealAt above so the
    // game can schedule the reveal without receiving names/images/socials early.
    participants: stand.reservations
      .filter((reservation) => !isReservationHidden(reservation))
      .flatMap((reservation) =>
        reservation.participants.map((p) => ({
          participantId: p.id,
          imageUrl: p.user.imageUrl,
          displayName: p.user.displayName,
          category: p.user.category,
          socials: p.user.userSocials.map((s) => ({
            type: s.type,
            username: s.username,
          })),
        })),
      ),
  }));

  return NextResponse.json(
    { stands: result },
    { headers: getCorsHeaders(request) },
  );
}
