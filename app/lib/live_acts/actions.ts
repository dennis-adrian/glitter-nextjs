"use server";

import { db } from "@/db";
import { liveActs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  CULTURAL_ACTIVITY_COPY,
  type LiveAct,
  type LiveActStatus,
  type NewLiveAct,
  type SubmitCulturalActivityResult,
} from "@/app/lib/live_acts/definitions";
import {
  type CulturalActivityValues,
  culturalActivitySchema,
} from "@/app/lib/live_acts/schema";
import {
  callerFingerprint,
  consumeActionRateLimit,
} from "@/app/lib/rate-limit";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/**
 * Per network address, like the volunteer form: generous, since people share
 * a connection and may take a few tries. It only stops floods.
 */
const RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

/** Same answer for a new postulation and a bot. */
const RECEIVED: SubmitCulturalActivityResult = { success: true };

function honeypotFilled(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const value = (input as { website?: unknown }).website;
  return typeof value === "string" && value.trim().length > 0;
}

/** The row for a parsed postulation: only its category's own fields. */
function liveActValuesFor(
  values: CulturalActivityValues,
  now: Date,
): NewLiveAct {
  return {
    actName: values.actName,
    category: values.category,
    description: values.description ?? null,
    resourceLink: values.resourceLink,
    socialLinks: values.socialLinks,
    contactName: values.contactName,
    contactEmail: values.contactEmail,
    contactPhone: values.contactPhone,
    otherType: values.category === "other" ? values.otherType : null,
    workshopCapacity:
      values.category === "workshop" ? values.workshopCapacity : null,
    spaceNeeds:
      values.category === "talk" ||
      values.category === "workshop" ||
      values.category === "other"
        ? values.spaceNeeds
        : null,
    relatedOffer: values.category === "workshop" ? values.relatedOffer : null,
    noCostAcknowledgedAt: values.category === "workshop" ? now : null,
    status: "pending",
    adminNotes: null,
  };
}

/**
 * Stores a cultural activity postulation from the public form. Server
 * actions are reachable by anyone, so the input is parsed here with the same
 * schema the wizard uses, behind a rate limit and a honeypot.
 */
export async function createLiveAct(
  input: unknown,
): Promise<SubmitCulturalActivityResult> {
  let allowed: boolean;
  try {
    allowed = await consumeActionRateLimit({
      key: `cultural-activity:ip:${callerFingerprint(await headers())}`,
      ...RATE_LIMIT,
    });
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return { success: false, message: CULTURAL_ACTIVITY_COPY.tooManyRequests };
  }

  if (honeypotFilled(input)) return RECEIVED;

  const parsed = culturalActivitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: CULTURAL_ACTIVITY_COPY.reviewFields };
  }

  try {
    await db.insert(liveActs).values(liveActValuesFor(parsed.data, new Date()));
  } catch (error) {
    // Drizzle's error message lists every param: a stranger's name, email
    // and phone. Log only what Postgres says went wrong.
    const cause = error instanceof Error && error.cause ? error.cause : error;
    const { code, constraint } = (cause ?? {}) as {
      code?: unknown;
      constraint?: unknown;
    };
    console.error("Error creating live act", { code, constraint });
    return { success: false, message: CULTURAL_ACTIVITY_COPY.genericError };
  }

  revalidatePath("/dashboard/live-acts");
  return RECEIVED;
}

export async function fetchLiveActs(): Promise<LiveAct[]> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return [];
  }

  try {
    return await db.select().from(liveActs).orderBy(desc(liveActs.createdAt));
  } catch (error) {
    console.error("Error fetching live acts", error);
    return [];
  }
}

export async function updateLiveActStatus(
  id: number,
  status: LiveActStatus,
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return {
      success: false,
      message: "No tenés permisos para realizar esta acción",
    };
  }

  try {
    const updated = await db
      .update(liveActs)
      .set({ status, updatedAt: new Date() })
      .where(eq(liveActs.id, id))
      .returning({ id: liveActs.id });

    if (updated.length === 0) {
      return { success: false, message: "Postulación no encontrada" };
    }
  } catch (error) {
    console.error("Error updating live act status", error);
    return { success: false, message: "Error al actualizar el estado" };
  }

  revalidatePath("/dashboard/live-acts");
  return { success: true, message: "Estado actualizado correctamente" };
}

export async function updateLiveActAdminNotes(
  id: number,
  notes: string,
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return {
      success: false,
      message: "No tenés permisos para realizar esta acción",
    };
  }

  try {
    const updated = await db
      .update(liveActs)
      .set({ adminNotes: notes, updatedAt: new Date() })
      .where(eq(liveActs.id, id))
      .returning({ id: liveActs.id });

    if (updated.length === 0) {
      return { success: false, message: "Postulación no encontrada" };
    }
  } catch (error) {
    console.error("Error updating live act admin notes", error);
    return { success: false, message: "Error al guardar las notas" };
  }

  revalidatePath("/dashboard/live-acts");
  return { success: true, message: "Notas guardadas correctamente" };
}
