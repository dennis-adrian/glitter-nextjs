"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fetchFeatureFlag } from "@/app/lib/feature_flags/data";
import {
  type AddFeatureFlagTargetInput,
  type RemoveFeatureFlagTargetInput,
  type UpdateFeatureFlagInput,
} from "@/app/lib/feature_flags/definitions";
import { isKnownFeatureFlagKey } from "@/app/lib/feature_flags/registry";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { featureFlagUserTargets, featureFlags, users } from "@/db/schema";

const NOTE_MAX = 200;

const updateFeatureFlagSchema = z.object({
  key: z.string().min(1),
  visibility: z.enum(["hidden", "admin_only", "public"]),
});

const addTargetSchema = z.object({
  key: z.string().min(1),
  email: z.string().trim().min(1).email(),
  note: z.string().trim().max(NOTE_MAX).nullish(),
});

const removeTargetSchema = z.object({
  key: z.string().min(1),
  userId: z.number().int().positive(),
});

/**
 * Every mutation here is admin-only — stricter than the `admin_only` preview
 * tier, which festival admins also get. Mirrors `updateStoreSettings`.
 */
async function requireAdmin() {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") return null;
  return profile;
}

/**
 * A flag can gate any route, so there is no useful narrower invalidation. Flips
 * are rare and deliberate, which makes the blunt version the right one.
 */
function revalidateEverything() {
  revalidatePath("/", "layout");
}

export async function updateFeatureFlagVisibility(
  input: UpdateFeatureFlagInput,
) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false, message: "No autorizado" } as const;
  }

  const parsed = updateFeatureFlagSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const { key, visibility } = parsed.data;
  if (!isKnownFeatureFlagKey(key)) {
    return { success: false, message: "Funcionalidad desconocida" } as const;
  }

  const current = await fetchFeatureFlag(key);

  await db
    .update(featureFlags)
    .set({ visibility, updatedByUserId: profile.id, updatedAt: new Date() })
    .where(eq(featureFlags.id, current.id));

  revalidateEverything();

  return { success: true, message: "Visibilidad actualizada" } as const;
}

/**
 * Grants one user access regardless of the flag's visibility. Looked up by
 * email because that is what an admin has on hand; the id is what gets stored.
 */
export async function addFeatureFlagTarget(input: AddFeatureFlagTargetInput) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false, message: "No autorizado" } as const;
  }

  const parsed = addTargetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Correo inválido" } as const;
  }

  const { key, email, note } = parsed.data;
  if (!isKnownFeatureFlagKey(key)) {
    return { success: false, message: "Funcionalidad desconocida" } as const;
  }

  // Compared lowercased rather than with `ilike`, so an admin typing an email by
  // hand need not match the stored casing while `%` and `_` stay literal
  // characters instead of pattern wildcards.
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);

  if (!target) {
    return {
      success: false,
      message: "No encontramos un perfil con ese correo",
    } as const;
  }

  const flag = await fetchFeatureFlag(key);

  const inserted = await db
    .insert(featureFlagUserTargets)
    .values({
      flagId: flag.id,
      userId: target.id,
      note: note?.trim() || null,
      createdByUserId: profile.id,
    })
    .onConflictDoNothing({
      target: [featureFlagUserTargets.flagId, featureFlagUserTargets.userId],
    })
    .returning();

  if (inserted.length === 0) {
    return {
      success: false,
      message: "Esa persona ya tiene acceso a esta funcionalidad",
    } as const;
  }

  revalidateEverything();

  return { success: true, message: "Acceso otorgado" } as const;
}

export async function removeFeatureFlagTarget(
  input: RemoveFeatureFlagTargetInput,
) {
  const profile = await requireAdmin();
  if (!profile) {
    return { success: false, message: "No autorizado" } as const;
  }

  const parsed = removeTargetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const { key, userId } = parsed.data;
  if (!isKnownFeatureFlagKey(key)) {
    return { success: false, message: "Funcionalidad desconocida" } as const;
  }

  const flag = await fetchFeatureFlag(key);

  await db
    .delete(featureFlagUserTargets)
    .where(
      and(
        eq(featureFlagUserTargets.flagId, flag.id),
        eq(featureFlagUserTargets.userId, userId),
      ),
    );

  revalidateEverything();

  return { success: true, message: "Acceso retirado" } as const;
}
