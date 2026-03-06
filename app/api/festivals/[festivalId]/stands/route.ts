import { db } from "@/db";
import { stands, standReservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ALLOWED_ORIGINS = [
	"http://localhost:8080",
	"https://game.glitter.com.bo",
];

function getCorsHeaders(request: NextRequest) {
	const origin = request.headers.get("origin") ?? "";
	const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
	return {
		"Access-Control-Allow-Origin": allowed,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};
}

export function OPTIONS(request: NextRequest) {
	return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

type FestivalStand = {
	standId: number;
	standLabel: string | null;
	standNumber: number;
	standDisplayLabel: string;
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

	const festivalStands = await db.query.stands.findMany({
		where: eq(stands.festivalId, festivalId),
		with: {
			reservations: {
				where: eq(standReservations.status, "accepted"),
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

	const result = festivalStands.map((stand) => ({
		standId: stand.id,
		standLabel: stand.label,
		standNumber: stand.standNumber,
		standDisplayLabel:
			stand.label && stand.standNumber
				? `${stand.label}${stand.standNumber}`
				: "",
		participants: stand.reservations.flatMap((reservation) =>
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

	return NextResponse.json({ stands: result }, { headers: getCorsHeaders(request) });
}
