import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { ReservationFeatureTemplate } from "@/app/lib/festival_exports/definitions";
import { isFeatureTypeImplemented } from "@/app/lib/festivals/feature-config";
import type { DrizzleTransactionScope } from "@/db/drizzleTransactionScope";
import { festivalReservationFeatures } from "@/db/schema";

/** A festival's reservation feature rows as they go into an export file. */
export function toReservationFeatureTemplates(
  rows: ReadonlyArray<typeof festivalReservationFeatures.$inferSelect>,
): ReservationFeatureTemplate[] {
  return rows
    .map((row) => ({
      type: row.type,
      category:
        row.category === "illustration" || row.category === "entrepreneurship"
          ? row.category
          : null,
      enabled: row.enabled,
      creditPrice: row.creditPrice,
      deadlineOverrideAt: row.deadlineOverrideAt?.toISOString() ?? null,
    }))
    .sort((a, b) =>
      `${a.type}:${a.category ?? ""}`.localeCompare(
        `${b.type}:${b.category ?? ""}`,
      ),
    );
}

/**
 * Writes each feature scope in the file onto a festival, creating it or
 * overwriting its configuration. Scopes the file does not mention are left as
 * they are.
 *
 * Only future activations read these rows: live access and submitted actions
 * carry their own price snapshot, so importing onto a festival already taking
 * reservations never rewrites what someone bought.
 */
export async function writeReservationFeatures(
  tx: DrizzleTransactionScope,
  input: {
    festivalId: number;
    features: readonly ReservationFeatureTemplate[];
    updatedByUserId: number;
  },
) {
  for (const feature of input.features) {
    const values = {
      // A file can predate a feature being switched off in code; never turn on
      // something nothing implements.
      enabled: feature.enabled && isFeatureTypeImplemented(feature.type),
      creditPrice: feature.creditPrice,
      deadlineOverrideAt: feature.deadlineOverrideAt
        ? new Date(feature.deadlineOverrideAt)
        : null,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date(),
    };

    const [existing] = await tx
      .select({ id: festivalReservationFeatures.id })
      .from(festivalReservationFeatures)
      .where(
        and(
          eq(festivalReservationFeatures.festivalId, input.festivalId),
          eq(festivalReservationFeatures.type, feature.type),
          feature.category === null
            ? isNull(festivalReservationFeatures.category)
            : eq(festivalReservationFeatures.category, feature.category),
        ),
      )
      .limit(1)
      .for("update");

    if (existing) {
      await tx
        .update(festivalReservationFeatures)
        .set(values)
        .where(eq(festivalReservationFeatures.id, existing.id));
    } else {
      await tx.insert(festivalReservationFeatures).values({
        ...values,
        festivalId: input.festivalId,
        type: feature.type,
        category: feature.category,
      });
    }
  }
}
