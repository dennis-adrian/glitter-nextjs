import QRCode from "qrcode";

import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { festivals } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * The QR to print for the venue entrance: it opens the festival's door
 * registration form. Large enough to print on a poster.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return new Response("No autorizado", { status: 403 });

  const festivalId = Number((await context.params).id);
  if (!Number.isInteger(festivalId) || festivalId <= 0) {
    return new Response("Festival no encontrado", { status: 404 });
  }

  const [festival] = await db
    .select({ id: festivals.id, festivalCode: festivals.festivalCode })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival) return new Response("Festival no encontrado", { status: 404 });

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
  const png = await QRCode.toBuffer(
    `${baseUrl}/festivals/${festival.id}/event_day_registration`,
    {
      margin: 2,
      width: 1200,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    },
  );

  const name = (festival.festivalCode || `festival-${festival.id}`)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="qr-registro-en-puerta-${name}.png"`,
      "Cache-Control": "private, no-store",
    },
  });
}
