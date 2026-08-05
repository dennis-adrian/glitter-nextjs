"use server";

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import { getBuyerEligibility } from "@/app/lib/programs/eligibility-queries";
import {
  fetchProgramPromoCode,
  fetchPromoConsumingUses,
} from "@/app/lib/programs/promo-code-queries";
import {
  isValidPromoCodeFormat,
  normalizePromoCode,
  resolvePromoCodeValidity,
  resolvePromoPrice,
} from "@/app/lib/programs/promo-codes";
import {
  globalDiscountFrom,
  programDiscountFrom,
  resolvePrice,
} from "@/app/lib/programs/pricing";
import { canPurchaseAudience } from "@/app/lib/programs/eligibility";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programSettings,
  programSessions,
  programs,
  sessionOccurrences,
} from "@/db/schema";

const previewSchema = z.object({
  occurrenceId: z.number().int().positive(),
  code: z.string().trim().min(1).max(64),
});

export type PromoCodePreviewResult =
  | {
      success: true;
      promoCodeId: number;
      code: string;
      partnerName: string;
      discountPercent: number;
      basePrice: number;
      existingPrice: number;
      promoPrice: number;
      discountAmount: number;
      differenceFromExisting: number;
      isHigherThanExisting: boolean;
    }
  | { success: false; message: string };

const UNAVAILABLE_MESSAGE = "Este código no está disponible para esta sesión";
const PROMO_PREVIEW_LIMIT = 15;
const PROMO_PREVIEW_WINDOW_MS = 60_000;

async function promoPreviewRateLimitKey(userId: number | null) {
  if (userId !== null) return `program-promo-preview:user:${userId}`;

  const requestHeaders = await headers();
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0];
  const clientIdentifier =
    requestHeaders.get("cf-connecting-ip")?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    forwardedIp?.trim() ||
    `unknown:${requestHeaders.get("user-agent") ?? "no-user-agent"}`;
  const digest = createHash("sha256").update(clientIdentifier).digest("hex");
  return `program-promo-preview:ip:${digest}`;
}

export async function previewProgramPromoCode(input: {
  occurrenceId: number;
  code: string;
}): Promise<PromoCodePreviewResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const profile = await getCurrentUserProfile();
  try {
    const allowed = await consumeActionRateLimit({
      key: await promoPreviewRateLimitKey(profile?.id ?? null),
      limit: PROMO_PREVIEW_LIMIT,
      windowMs: PROMO_PREVIEW_WINDOW_MS,
    });
    if (!allowed) return { success: false, message: UNAVAILABLE_MESSAGE };
  } catch {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  }

  const parsed = previewSchema.safeParse(input);
  if (!parsed.success || !isValidPromoCodeFormat(parsed.data.code)) {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  }

  const now = new Date();
  const { eligibility } = await getBuyerEligibility(profile, { now });

  const [context] = await db
    .select({
      occurrence: sessionOccurrences,
      session: programSessions,
      program: programs,
    })
    .from(sessionOccurrences)
    .innerJoin(
      programSessions,
      eq(programSessions.id, sessionOccurrences.sessionId),
    )
    .innerJoin(programs, eq(programs.id, programSessions.programId))
    .where(eq(sessionOccurrences.id, parsed.data.occurrenceId))
    .limit(1);

  if (!context) return { success: false, message: UNAVAILABLE_MESSAGE };

  const occurrenceState = resolveOccurrenceState(
    {
      programStatus: context.program.status,
      sessionStatus: context.session.status,
      lifecycleStatus: context.occurrence.lifecycleStatus,
      salesStartAt: context.occurrence.salesStartAt,
      salesEndAt: context.occurrence.salesEndAt,
      salesClosedAt: context.occurrence.salesClosedAt,
      rescheduledAt: context.occurrence.rescheduledAt,
    },
    now,
  );

  if (
    !occurrenceState.isPurchasable ||
    !canPurchaseAudience(context.session.audience, eligibility) ||
    context.session.publicPrice <= 0
  ) {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  }

  const [settings, promoCode] = await Promise.all([
    db.query.programSettings.findFirst({
      where: eq(programSettings.key, "global"),
    }),
    fetchProgramPromoCode(db, context.program.id, parsed.data.code),
  ]);

  if (!settings || !promoCode) {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  }

  const consumingUses = await fetchPromoConsumingUses(db, promoCode.id, now);
  const validity = resolvePromoCodeValidity(
    { ...promoCode, consumingUses },
    now,
  );
  if (!validity.allowed) {
    return { success: false, message: UNAVAILABLE_MESSAGE };
  }

  const existing = resolvePrice(
    {
      publicPrice: context.session.publicPrice,
      participantPrice: context.session.participantPrice,
      programDiscount: programDiscountFrom(context.program),
      globalDiscount: globalDiscountFrom(settings),
    },
    eligibility,
  );
  const price = resolvePromoPrice({
    basePrice: context.session.publicPrice,
    existingPrice: existing.amount,
    discountPercent: promoCode.discountPercent,
  });

  return {
    success: true,
    promoCodeId: promoCode.id,
    code: normalizePromoCode(promoCode.code),
    partnerName: promoCode.partnerName,
    discountPercent: promoCode.discountPercent,
    ...price,
  };
}
