"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ensureUniqueProgramSlug,
  ensureUniqueSessionSlug,
} from "@/app/lib/programs/slug";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import {
  SESSION_PUBLISH_BLOCKER_LABELS,
  resolveSessionPublishability,
} from "@/app/lib/programs/state";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programSessions,
  programs,
  sessionOccurrences,
  sessionSpeakers,
} from "@/db/schema";

const TITLE_MAX = 200;
const TEXT_MAX = 5000;

const programSchema = z.object({
  name: z.string().trim().min(1).max(TITLE_MAX),
  summary: z.string().trim().max(TEXT_MAX).nullish(),
  description: z.string().trim().max(TEXT_MAX).nullish(),
  bannerUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine(isAllowedProgramArtworkUrl)
    .nullish()
    .or(z.literal("")),
  thumbnailUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine(isAllowedProgramArtworkUrl)
    .nullish()
    .or(z.literal("")),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  festivalId: z.number().int().positive().nullish(),
  defaultVenueId: z.number().int().positive().nullish(),
  participantDiscountType: z.enum(["percent", "fixed"]).nullish(),
  participantDiscountValue: z.number().min(0).nullish(),
});

const sessionSchema = z.object({
  programId: z.number().int().positive(),
  title: z.string().trim().min(1).max(TITLE_MAX),
  type: z.enum(["talk", "workshop"]),
  topic: z.string().trim().max(TITLE_MAX).nullish(),
  description: z.string().trim().max(TEXT_MAX).nullish(),
  learningOutcomes: z
    .array(z.string().trim().min(1).max(300))
    .max(10)
    .optional(),
  skillLevel: z.enum(["beginner", "intermediate", "advanced"]).nullish(),
  imageUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine(isAllowedProgramArtworkUrl)
    .nullish()
    .or(z.literal("")),
  audience: z.enum(["all", "participants_only", "public_only"]),
  publicPrice: z.number().min(0),
  participantPrice: z.number().min(0).nullish(),
  venueId: z.number().int().positive().nullish(),
  displayOrder: z.number().int().min(0).optional(),
});

export type ProgramInput = z.input<typeof programSchema>;
export type SessionInput = z.input<typeof sessionSchema>;

function blankToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

type DiscountFields = {
  participantDiscountType?: "percent" | "fixed" | null;
  participantDiscountValue?: number | null;
};

/**
 * The discount override is a pair: either both columns are set or neither is.
 * `programs_discount_pair_complete` enforces it in the database; this turns a
 * half-filled form into a message instead of a constraint violation.
 */
function validateDiscount(data: DiscountFields) {
  const type = data.participantDiscountType ?? null;
  const value = data.participantDiscountValue ?? null;

  if ((type === null) !== (value === null)) {
    return {
      success: false,
      message: "Elige el tipo de descuento y su valor, o deja ambos vacíos",
    } as const;
  }

  if (type === "percent" && value !== null && value > 100) {
    return {
      success: false,
      message: "Un descuento porcentual no puede superar el 100%",
    } as const;
  }

  return null;
}

/** Normalizes the pair so a cleared discount writes two nulls, never one. */
function discountColumns(data: DiscountFields) {
  const type = data.participantDiscountType ?? null;
  const value = data.participantDiscountValue ?? null;
  const isComplete = type !== null && value !== null;

  return {
    participantDiscountType: isComplete ? type : null,
    participantDiscountValue: isComplete ? value : null,
  };
}

function revalidatePrograms() {
  revalidatePath("/dashboard/programs", "layout");
  revalidatePath("/programs", "layout");
}

/* --------------------------------- Programs --------------------------------- */

export async function createProgram(input: ProgramInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = programSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const data = parsed.data;
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return {
      success: false,
      message: "La fecha de fin no puede ser anterior a la de inicio",
    } as const;
  }

  const discountError = validateDiscount(data);
  if (discountError) return discountError;

  const program = await db.transaction(async (tx) => {
    const slug = await ensureUniqueProgramSlug(tx, data.name);

    const [row] = await tx
      .insert(programs)
      .values({
        name: data.name,
        slug,
        summary: blankToNull(data.summary),
        description: blankToNull(data.description),
        bannerUrl: blankToNull(data.bannerUrl),
        thumbnailUrl: blankToNull(data.thumbnailUrl),
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        festivalId: data.festivalId ?? null,
        defaultVenueId: data.defaultVenueId ?? null,
        ...discountColumns(data),
      })
      .returning();

    return row;
  });

  revalidatePrograms();

  return {
    success: true,
    message: "Programa creado",
    programId: program.id,
    slug: program.slug,
  } as const;
}

export async function updateProgram(programId: number, input: ProgramInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = programSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const data = parsed.data;
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return {
      success: false,
      message: "La fecha de fin no puede ser anterior a la de inicio",
    } as const;
  }

  const discountError = validateDiscount(data);
  if (discountError) return discountError;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ slug: programs.slug, publishedAt: programs.publishedAt })
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);

    // Renaming a published program must not move its public URL — links already
    // shared would break. Only a program that was never published follows its
    // name.
    const slug =
      existing?.publishedAt && existing.slug
        ? existing.slug
        : await ensureUniqueProgramSlug(tx, data.name, programId);

    await tx
      .update(programs)
      .set({
        name: data.name,
        slug,
        summary: blankToNull(data.summary),
        description: blankToNull(data.description),
        bannerUrl: blankToNull(data.bannerUrl),
        thumbnailUrl: blankToNull(data.thumbnailUrl),
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        festivalId: data.festivalId ?? null,
        defaultVenueId: data.defaultVenueId ?? null,
        ...discountColumns(data),
        updatedAt: new Date(),
      })
      .where(eq(programs.id, programId));
  });

  revalidatePrograms();

  return { success: true, message: "Programa actualizado" } as const;
}

export async function publishProgram(programId: number) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const now = new Date();

  const [updated] = await db
    .update(programs)
    .set({
      status: "published",
      // First publication only. `updateProgram` freezes the slug once this is
      // set, so moving it on a republish could move the program's public URL.
      publishedAt: sql`coalesce(${programs.publishedAt}, ${now})`,
      updatedAt: now,
    })
    .where(eq(programs.id, programId))
    .returning({ id: programs.id });

  if (!updated) {
    return { success: false, message: "Programa no encontrado" } as const;
  }

  revalidatePrograms();

  return { success: true, message: "Programa publicado" } as const;
}

/**
 * Hiding the program hides every session with it, without touching each
 * session's own status — so re-publishing restores exactly what was visible
 * before.
 */
export async function unpublishProgram(programId: number) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  await db
    .update(programs)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(programs.id, programId));

  revalidatePrograms();

  return { success: true, message: "Programa ocultado" } as const;
}

/* --------------------------------- Sessions --------------------------------- */

export async function createSession(input: SessionInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const data = parsed.data;
  const priceError = validatePrices(data.publicPrice, data.participantPrice);
  if (priceError) return priceError;

  const session = await db.transaction(async (tx) => {
    const slug = await ensureUniqueSessionSlug(tx, data.programId, data.title);

    const [row] = await tx
      .insert(programSessions)
      .values({
        programId: data.programId,
        slug,
        title: data.title,
        type: data.type,
        topic: blankToNull(data.topic),
        description: blankToNull(data.description),
        learningOutcomes: data.learningOutcomes ?? [],
        skillLevel: data.skillLevel ?? null,
        imageUrl: blankToNull(data.imageUrl),
        audience: data.audience,
        publicPrice: data.publicPrice,
        participantPrice: data.participantPrice ?? null,
        venueId: data.venueId ?? null,
        displayOrder: data.displayOrder ?? 0,
      })
      .returning();

    return row;
  });

  revalidatePrograms();

  return {
    success: true,
    message: "Sesión creada",
    sessionId: session.id,
  } as const;
}

export async function updateSession(sessionId: number, input: SessionInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const data = parsed.data;
  const priceError = validatePrices(data.publicPrice, data.participantPrice);
  if (priceError) return priceError;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        slug: programSessions.slug,
        publishedAt: programSessions.publishedAt,
      })
      .from(programSessions)
      .where(eq(programSessions.id, sessionId))
      .limit(1);

    // Same rule as programs: a published session keeps the URL it was published
    // under, however its title changes afterwards.
    const slug =
      existing?.publishedAt && existing.slug
        ? existing.slug
        : await ensureUniqueSessionSlug(
            tx,
            data.programId,
            data.title,
            sessionId,
          );

    await tx
      .update(programSessions)
      .set({
        slug,
        title: data.title,
        type: data.type,
        topic: blankToNull(data.topic),
        description: blankToNull(data.description),
        learningOutcomes: data.learningOutcomes ?? [],
        skillLevel: data.skillLevel ?? null,
        imageUrl: blankToNull(data.imageUrl),
        audience: data.audience,
        publicPrice: data.publicPrice,
        participantPrice: data.participantPrice ?? null,
        venueId: data.venueId ?? null,
        ...(data.displayOrder === undefined
          ? {}
          : { displayOrder: data.displayOrder }),
        updatedAt: new Date(),
      })
      .where(eq(programSessions.id, sessionId));
  });

  revalidatePrograms();

  return { success: true, message: "Sesión actualizada" } as const;
}

function validatePrices(publicPrice: number, participantPrice?: number | null) {
  if (participantPrice != null && participantPrice > publicPrice) {
    return {
      success: false,
      message: "El precio para participantes no puede superar al público",
    } as const;
  }
  return null;
}

/* ------------------------------- Publication -------------------------------- */

/** Loads exactly what `resolveSessionPublishability` needs, for one program. */
async function loadPublishInputs(programId: number, sessionId?: number) {
  const rows = await db.query.programSessions.findMany({
    where: sessionId
      ? and(
          eq(programSessions.programId, programId),
          eq(programSessions.id, sessionId),
        )
      : eq(programSessions.programId, programId),
    with: {
      occurrences: {
        columns: { lifecycleStatus: true, venueId: true },
      },
      sessionSpeakers: { columns: { id: true } },
      program: { columns: { defaultVenueId: true } },
    },
  });

  return rows;
}

export async function publishSession(sessionId: number) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const session = await db.query.programSessions.findFirst({
    where: eq(programSessions.id, sessionId),
    with: {
      occurrences: { columns: { lifecycleStatus: true, venueId: true } },
      sessionSpeakers: { columns: { id: true } },
      program: { columns: { defaultVenueId: true } },
    },
  });

  if (!session) {
    return { success: false, message: "Sesión no encontrada" } as const;
  }

  const publishability = resolveSessionPublishability({
    status: session.status,
    venueId: session.venueId,
    programDefaultVenueId: session.program.defaultVenueId,
    speakerCount: session.sessionSpeakers.length,
    occurrences: session.occurrences,
  });

  if (!publishability.publishable) {
    return {
      success: false,
      message: SESSION_PUBLISH_BLOCKER_LABELS[publishability.blocker],
    } as const;
  }

  const now = new Date();

  await db
    .update(programSessions)
    .set({
      status: "published",
      // Same rule as programs, and the same rule `publishProgramWithSessions`
      // applies — publishing one session must not differ from publishing all.
      publishedAt: sql`coalesce(${programSessions.publishedAt}, ${now})`,
      updatedAt: now,
    })
    .where(eq(programSessions.id, sessionId));

  revalidatePrograms();

  return { success: true, message: "Sesión publicada" } as const;
}

export async function unpublishSession(sessionId: number) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  await db
    .update(programSessions)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(programSessions.id, sessionId));

  revalidatePrograms();

  return { success: true, message: "Sesión ocultada" } as const;
}

/**
 * Publishes the program and every eligible session in one action. Sessions that
 * are cancelled, completed, already published, or incomplete are skipped and
 * reported — never overwritten (roadmap Phase 1).
 */
export async function publishProgramWithSessions(programId: number) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const sessions = await loadPublishInputs(programId);

  const publishable: number[] = [];
  const skipped: { title: string; reason: string }[] = [];

  for (const session of sessions) {
    const publishability = resolveSessionPublishability({
      status: session.status,
      venueId: session.venueId,
      programDefaultVenueId: session.program.defaultVenueId,
      speakerCount: session.sessionSpeakers.length,
      occurrences: session.occurrences,
    });

    if (publishability.publishable) {
      publishable.push(session.id);
    } else if (publishability.blocker !== "already_published") {
      skipped.push({
        title: session.title,
        reason: SESSION_PUBLISH_BLOCKER_LABELS[publishability.blocker],
      });
    }
  }

  const now = new Date();

  const published = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(programs)
      .set({
        status: "published",
        // Only on first publication. Overwriting it on every republish would
        // move the program's public URL, because `updateProgram` keeps the slug
        // frozen precisely once `publishedAt` is set.
        publishedAt: sql`coalesce(${programs.publishedAt}, ${now})`,
        updatedAt: now,
      })
      .where(eq(programs.id, programId))
      .returning({ id: programs.id });

    // No row means no program. Reporting success with zero sessions would tell
    // the admin the publish worked.
    if (!updated) return false;

    for (const sessionId of publishable) {
      await tx
        .update(programSessions)
        .set({
          status: "published",
          publishedAt: sql`coalesce(${programSessions.publishedAt}, ${now})`,
          updatedAt: now,
        })
        .where(eq(programSessions.id, sessionId));
    }

    return true;
  });

  if (!published) {
    return { success: false, message: "Programa no encontrado" } as const;
  }

  revalidatePrograms();

  return {
    success: true,
    message:
      skipped.length === 0
        ? `Programa publicado con ${publishable.length} sesión(es)`
        : `Programa publicado con ${publishable.length} sesión(es); ${skipped.length} omitida(s)`,
    publishedCount: publishable.length,
    skipped,
  } as const;
}

/* ----------------------------- Session speakers ----------------------------- */

export async function attachSpeakerToSession(input: {
  sessionId: number;
  speakerId: number;
  role?: string | null;
  displayOrder?: number;
}) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const inserted = await db
    .insert(sessionSpeakers)
    .values({
      sessionId: input.sessionId,
      speakerId: input.speakerId,
      role: blankToNull(input.role),
      displayOrder: input.displayOrder ?? 0,
    })
    .onConflictDoNothing({
      target: [sessionSpeakers.sessionId, sessionSpeakers.speakerId],
    })
    .returning();

  if (inserted.length === 0) {
    return {
      success: false,
      message: "Ese expositor ya está en la sesión",
    } as const;
  }

  revalidatePrograms();

  return { success: true, message: "Expositor agregado" } as const;
}

export async function detachSpeakerFromSession(
  sessionId: number,
  speakerId: number,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  await db
    .delete(sessionSpeakers)
    .where(
      and(
        eq(sessionSpeakers.sessionId, sessionId),
        eq(sessionSpeakers.speakerId, speakerId),
      ),
    );

  // A published session with no speakers left would fail its own publish
  // validation, so keep the two consistent by hiding it again.
  const remaining = await db
    .select({ id: sessionSpeakers.id })
    .from(sessionSpeakers)
    .where(eq(sessionSpeakers.sessionId, sessionId))
    .limit(1);

  if (remaining.length === 0) {
    await db
      .update(programSessions)
      .set({ status: "draft", updatedAt: new Date() })
      .where(
        and(
          eq(programSessions.id, sessionId),
          eq(programSessions.status, "published"),
        ),
      );
  }

  revalidatePrograms();

  return { success: true, message: "Expositor retirado" } as const;
}

/** Occurrence count, used by the dashboard to warn before unpublishing. */
export async function countSessionOccurrences(sessionId: number) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const [row] = await db
    .select({ total: count() })
    .from(sessionOccurrences)
    .where(eq(sessionOccurrences.sessionId, sessionId));

  return { success: true, count: row?.total ?? 0 } as const;
}
