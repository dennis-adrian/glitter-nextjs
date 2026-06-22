import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import { fetchFestivalActivityForReview } from "@/app/lib/festivals/actions";
import { isCouponBookDraft } from "@/app/lib/festival_activites/coupon-book-draft";
import {
  findInvalidDraftParticipationId,
  MAX_DRAFT_BYTES,
  sanitizeCouponBookDraft,
} from "@/app/lib/festival_activites/coupon-book-config-actions";
import {
  generateCouponBookPdf,
  generateDraftCouponBookPdf,
} from "@/app/lib/festival_activites/coupon-book-export";
import { resolvePdfCanvasConfig } from "@/app/lib/festival_activites/coupon-book-print-config";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
  activityId: z.coerce.number(),
});

const PostBodySchema = z.object({
  draft: z.unknown(),
  exportScope: z.union([
    z.object({ type: z.literal("all") }),
    z.object({ type: z.literal("book"), bookId: z.string().min(1) }),
  ]),
});

async function requireAdmin() {
  const profile = await getCurrentUserProfile();
  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "festival_admin")
  ) {
    return null;
  }
  return profile;
}

/** @deprecated Use POST with the editor draft. GET rebuilds from live DB state only. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ activityId: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) {
    return new Response("No autorizado", { status: 401 });
  }

  const validatedParams = ParamsSchema.safeParse(await context.params);
  if (!validatedParams.success) {
    return new Response("Parámetros inválidos", { status: 400 });
  }

  const searchParams = new URLSearchParams(request.nextUrl.searchParams);
  const requestedDetailId = searchParams.get("detailId");
  const parsedDetailId = requestedDetailId ? Number(requestedDetailId) : null;
  const detailId = Number.isFinite(parsedDetailId) ? parsedDetailId : null;
  if (detailId === null) {
    searchParams.delete("detailId");
  } else {
    searchParams.set("detailId", String(detailId));
  }
  const { activityId } = validatedParams.data;
  const activity = await fetchFestivalActivity(activityId);
  if (!activity) {
    return new Response("Actividad no encontrada", { status: 404 });
  }
  if (
    detailId !== null &&
    !activity.details.some((detail) => detail.id === detailId)
  ) {
    return new Response("Variante no encontrada", { status: 404 });
  }

  resolvePdfCanvasConfig(searchParams);

  const suffix =
    detailId !== null ? `variante-${detailId}` : "todas-las-variantes";

  return generateCouponBookPdf({
    request,
    festivalId: activity.festivalId,
    activityId,
    searchParams,
    fileNameSuffix: suffix,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ activityId: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) {
    return new Response("No autorizado", { status: 401 });
  }

  const validatedParams = ParamsSchema.safeParse(await context.params);
  if (!validatedParams.success) {
    return new Response("Parámetros inválidos", { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response("Cuerpo inválido", { status: 400 });
  }

  const serialized = JSON.stringify(rawBody);
  if (serialized.length > MAX_DRAFT_BYTES) {
    return new Response("El borrador de exportación es demasiado grande.", {
      status: 413,
    });
  }

  let body: z.infer<typeof PostBodySchema>;
  try {
    body = PostBodySchema.parse(rawBody);
  } catch {
    return new Response("Cuerpo inválido", { status: 400 });
  }

  if (!isCouponBookDraft(body.draft)) {
    return new Response("Borrador inválido", { status: 400 });
  }

  const { activityId } = validatedParams.data;
  if (body.draft.activityId !== activityId) {
    return new Response("El borrador no corresponde a esta actividad", {
      status: 400,
    });
  }

  const activity = await fetchFestivalActivityForReview(
    body.draft.festivalId,
    activityId,
  );
  if (!activity) {
    return new Response("Actividad no encontrada", { status: 404 });
  }

  const validParticipationIds = new Set<number>();
  for (const detail of activity.details) {
    for (const participant of detail.participants) {
      if (participant.removedAt === null) {
        validParticipationIds.add(participant.id);
      }
    }
  }

  const invalidParticipationId = findInvalidDraftParticipationId(
    body.draft,
    validParticipationIds,
  );
  if (invalidParticipationId !== null) {
    return new Response(
      `Participación inválida en el borrador: ${invalidParticipationId}`,
      { status: 400 },
    );
  }

  const sanitizedDraft = sanitizeCouponBookDraft(body.draft);

  const suffix =
    body.exportScope.type === "all"
      ? "todas-las-variantes"
      : `libro-${body.exportScope.bookId}`;

  return generateDraftCouponBookPdf({
    request,
    activityId,
    draft: sanitizedDraft,
    exportScope: body.exportScope,
    fileNameSuffix: suffix,
  });
}
