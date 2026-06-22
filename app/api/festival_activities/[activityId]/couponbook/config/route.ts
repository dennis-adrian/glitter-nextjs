import { NextRequest } from "next/server";
import { z } from "zod";

import {
  buildInitialCouponBookDraft,
  isCouponBookDraft,
  reconcileDraftWithSource,
} from "@/app/lib/festival_activites/coupon-book-draft";
import {
  fetchSavedCouponBookConfig,
  sanitizeCouponBookDraft,
  saveCouponBookConfig,
} from "@/app/lib/festival_activites/coupon-book-config-actions";
import { buildCouponBookVariants } from "@/app/lib/festival_activites/coupon-book-builder";
import { fetchFestivalActivityForReview } from "@/app/lib/festivals/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
  activityId: z.coerce.number(),
});

const PutBodySchema = z.object({
  draft: z.unknown(),
  expectedRevision: z.number().int().positive().nullable().optional(),
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ activityId: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const validatedParams = ParamsSchema.safeParse(await context.params);
  if (!validatedParams.success) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const { activityId } = validatedParams.data;
  const saved = await fetchSavedCouponBookConfig(activityId);
  if (!saved.draft) {
    return Response.json({
      config: null,
      revision: saved.revision,
      updatedAt: saved.updatedAt,
      reconciliation: null,
    });
  }

  const activity = await fetchFestivalActivityForReview(
    saved.draft.festivalId,
    activityId,
  );
  if (!activity) {
    return Response.json({ error: "Actividad no encontrada" }, { status: 404 });
  }

  const sourceDraft = buildInitialCouponBookDraft({
    festivalId: saved.draft.festivalId,
    activityId,
    variants: buildCouponBookVariants(activity),
  });

  return Response.json({
    config: saved.draft,
    revision: saved.revision,
    updatedAt: saved.updatedAt,
    reconciliation: reconcileDraftWithSource(saved.draft, sourceDraft),
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ activityId: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const validatedParams = ParamsSchema.safeParse(await context.params);
  if (!validatedParams.success) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  let body: z.infer<typeof PutBodySchema>;
  try {
    body = PutBodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!isCouponBookDraft(body.draft)) {
    return Response.json({ error: "Borrador inválido" }, { status: 400 });
  }

  const { activityId } = validatedParams.data;
  if (body.draft.activityId !== activityId) {
    return Response.json(
      { error: "El borrador no corresponde a esta actividad" },
      { status: 400 },
    );
  }

  const activity = await fetchFestivalActivityForReview(
    body.draft.festivalId,
    activityId,
  );
  if (!activity) {
    return Response.json({ error: "Actividad no encontrada" }, { status: 404 });
  }

  const validParticipationIds = new Set<number>();
  for (const detail of activity.details) {
    for (const participant of detail.participants) {
      if (participant.removedAt === null) {
        validParticipationIds.add(participant.id);
      }
    }
  }

  const result = await saveCouponBookConfig({
    activityId,
    draft: sanitizeCouponBookDraft(body.draft),
    userId: profile.id,
    validParticipationIds,
    expectedRevision: body.expectedRevision,
  });

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        currentRevision: result.currentRevision,
      },
      { status: result.status ?? 400 },
    );
  }

  return Response.json({
    ok: true,
    revision: result.revision,
  });
}
