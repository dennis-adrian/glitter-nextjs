import "server-only";

/**
 * A database handle. Callers inside a transaction must pass their `tx`:
 * reaching for the module-level pool while holding locks checks out a second
 * connection that only a finishing transaction can free.
 */
type FeatureConfigDb = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

import { and, asc, eq, isNull } from "drizzle-orm";

import {
  allFeatureScopes,
  type EffectiveFeatureConfig,
  type FeatureConfigRow,
  type FeatureType,
  type FullTableCategory,
  resolveFeatureConfig,
} from "@/app/lib/festivals/feature-config";
import { db } from "@/db";
import { festivalDates, festivalReservationFeatures } from "@/db/schema";

export type FestivalFeatureScope = {
  type: FeatureType;
  category: FullTableCategory | null;
  /** Null when the festival has never configured this scope. */
  config: EffectiveFeatureConfig | null;
};

async function earliestStartDate(
  festivalId: number,
  database: FeatureConfigDb = db,
): Promise<Date | null> {
  const [row] = await database
    .select({ startDate: festivalDates.startDate })
    .from(festivalDates)
    .where(eq(festivalDates.festivalId, festivalId))
    .orderBy(asc(festivalDates.startDate))
    .limit(1);
  return row?.startDate ?? null;
}

function toRow(
  row: typeof festivalReservationFeatures.$inferSelect,
): FeatureConfigRow {
  return {
    id: row.id,
    type: row.type as FeatureType,
    category: row.category as FullTableCategory | null,
    enabled: row.enabled,
    creditPrice: Number(row.creditPrice),
    deadlineOverrideAt: row.deadlineOverrideAt,
  };
}

/**
 * Every configurable scope for a festival, whether or not a row exists yet.
 *
 * Returning unconfigured scopes as `config: null` rather than omitting them is
 * what lets the panel show an admin the whole surface at once — a feature
 * nobody has touched is unavailable, and that should be visible, not absent.
 */
export async function fetchFestivalFeatureScopes(
  festivalId: number,
  now = new Date(),
): Promise<FestivalFeatureScope[]> {
  const [rows, startDate] = await Promise.all([
    db
      .select()
      .from(festivalReservationFeatures)
      .where(eq(festivalReservationFeatures.festivalId, festivalId)),
    earliestStartDate(festivalId),
  ]);

  const byScope = new Map(
    rows.map((row) => [`${row.type}:${row.category ?? ""}`, row]),
  );

  return allFeatureScopes().map((scope) => {
    const row = byScope.get(`${scope.type}:${scope.category ?? ""}`);
    return {
      type: scope.type,
      category: scope.category,
      config: row
        ? resolveFeatureConfig(toRow(row), {
            earliestStartDate: startDate,
            now,
          })
        : null,
    };
  });
}

/**
 * Resolves one scope for a participant-facing check. Returns null when the
 * festival has never configured it, which callers must treat as unavailable.
 */
export async function fetchFeatureConfig(
  festivalId: number,
  type: FeatureType,
  category: FullTableCategory | null = null,
  now = new Date(),
  database: FeatureConfigDb = db,
): Promise<EffectiveFeatureConfig | null> {
  const [row] = await database
    .select()
    .from(festivalReservationFeatures)
    .where(
      and(
        eq(festivalReservationFeatures.festivalId, festivalId),
        eq(festivalReservationFeatures.type, type),
        category === null
          ? isNull(festivalReservationFeatures.category)
          : eq(festivalReservationFeatures.category, category),
      ),
    )
    .limit(1);
  if (!row) return null;

  return resolveFeatureConfig(toRow(row), {
    // Only the late-partner deadline consults it, and activation calls this
    // while holding the festival and user locks.
    earliestStartDate:
      type === "late_partner"
        ? await earliestStartDate(festivalId, database)
        : null,
    now,
  });
}

export type UpsertFeatureConfigInput = {
  festivalId: number;
  type: FeatureType;
  category: FullTableCategory | null;
  enabled: boolean;
  creditPrice: number;
  deadlineOverrideAt: Date | null;
  updatedByUserId: number;
};

export type UpsertFeatureConfigResult =
  | { ok: true; id: number }
  | { ok: false; code: "INVALID_SCOPE" | "INVALID_PRICE" };

/**
 * Creates or updates one scope's configuration.
 *
 * A change only affects future activations: live access and submitted actions
 * carry their own price snapshot, so repricing never rewrites what someone
 * already bought.
 */
export async function upsertFestivalFeatureConfig(
  input: UpsertFeatureConfigInput,
): Promise<UpsertFeatureConfigResult> {
  // The database enforces these too; checking here turns a constraint
  // violation into a message the panel can show.
  const scopeValid =
    input.type === "full_table"
      ? input.category === "illustration" ||
        input.category === "entrepreneurship"
      : input.category === null;
  if (!scopeValid) return { ok: false, code: "INVALID_SCOPE" };
  if (input.deadlineOverrideAt && input.type !== "late_partner") {
    return { ok: false, code: "INVALID_SCOPE" };
  }
  if (
    !Number.isFinite(input.creditPrice) ||
    input.creditPrice < 0 ||
    Math.abs(Math.round(input.creditPrice * 100) / 100 - input.creditPrice) >=
      1e-9
  ) {
    return { ok: false, code: "INVALID_PRICE" };
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: festivalReservationFeatures.id })
      .from(festivalReservationFeatures)
      .where(
        and(
          eq(festivalReservationFeatures.festivalId, input.festivalId),
          eq(festivalReservationFeatures.type, input.type),
          input.category === null
            ? isNull(festivalReservationFeatures.category)
            : eq(festivalReservationFeatures.category, input.category),
        ),
      )
      .limit(1)
      .for("update");

    if (existing) {
      await tx
        .update(festivalReservationFeatures)
        .set({
          enabled: input.enabled,
          creditPrice: input.creditPrice,
          deadlineOverrideAt: input.deadlineOverrideAt,
          updatedByUserId: input.updatedByUserId,
          updatedAt: new Date(),
        })
        .where(eq(festivalReservationFeatures.id, existing.id));
      return { ok: true as const, id: existing.id };
    }

    const [created] = await tx
      .insert(festivalReservationFeatures)
      .values({
        festivalId: input.festivalId,
        type: input.type,
        category: input.category,
        enabled: input.enabled,
        creditPrice: input.creditPrice,
        deadlineOverrideAt: input.deadlineOverrideAt,
        updatedByUserId: input.updatedByUserId,
      })
      .returning({ id: festivalReservationFeatures.id });
    return { ok: true as const, id: created!.id };
  });
}
