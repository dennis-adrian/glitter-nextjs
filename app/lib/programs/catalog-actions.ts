"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { speakers, venues } from "@/db/schema";

const NAME_MAX = 200;
const OCCUPATION_MAX = 200;
const BIO_MAX = 2000;

const venueSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  address: z.string().trim().max(NAME_MAX).nullish(),
  locationLabel: z.string().trim().max(NAME_MAX).nullish(),
  locationUrl: z.string().trim().url().max(500).nullish().or(z.literal("")),
  isActive: z.boolean().optional(),
});

const speakerSchema = z.object({
  publicName: z.string().trim().min(1).max(NAME_MAX),
  occupation: z.string().trim().max(OCCUPATION_MAX).nullish(),
  imageUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine(isAllowedProgramArtworkUrl)
    .nullish()
    .or(z.literal("")),
  bio: z.string().trim().max(BIO_MAX).nullish(),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        url: z.string().trim().url().max(500),
      }),
    )
    .max(6)
    .optional(),
  isActive: z.boolean().optional(),
});

export type VenueInput = z.input<typeof venueSchema>;
export type SpeakerInput = z.input<typeof speakerSchema>;

function blankToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function revalidateCatalog() {
  revalidatePath("/dashboard/programs", "layout");
  revalidatePath("/programs", "layout");
}

export async function createVenue(input: VenueInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = venueSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const [venue] = await db
    .insert(venues)
    .values({
      name: parsed.data.name,
      address: blankToNull(parsed.data.address),
      locationLabel: blankToNull(parsed.data.locationLabel),
      locationUrl: blankToNull(parsed.data.locationUrl),
      isActive: parsed.data.isActive ?? true,
    })
    .returning();

  revalidateCatalog();

  return { success: true, message: "Lugar creado", venueId: venue.id } as const;
}

export async function updateVenue(venueId: number, input: VenueInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = venueSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const [updated] = await db
    .update(venues)
    .set({
      name: parsed.data.name,
      address: blankToNull(parsed.data.address),
      locationLabel: blankToNull(parsed.data.locationLabel),
      locationUrl: blankToNull(parsed.data.locationUrl),
      ...(parsed.data.isActive === undefined
        ? {}
        : { isActive: parsed.data.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(venues.id, venueId))
    .returning({ id: venues.id });

  if (!updated) {
    return { success: false, message: "Lugar no encontrado" } as const;
  }

  revalidateCatalog();

  return { success: true, message: "Lugar actualizado" } as const;
}

export async function createSpeaker(input: SpeakerInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = speakerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const [speaker] = await db
    .insert(speakers)
    .values({
      publicName: parsed.data.publicName,
      occupation: blankToNull(parsed.data.occupation),
      imageUrl: blankToNull(parsed.data.imageUrl),
      bio: blankToNull(parsed.data.bio),
      links: parsed.data.links ?? [],
      isActive: parsed.data.isActive ?? true,
    })
    .returning();

  revalidateCatalog();

  return {
    success: true,
    message: "Expositor creado",
    speakerId: speaker.id,
  } as const;
}

export async function updateSpeaker(speakerId: number, input: SpeakerInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = speakerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const [updated] = await db
    .update(speakers)
    .set({
      publicName: parsed.data.publicName,
      occupation: blankToNull(parsed.data.occupation),
      imageUrl: blankToNull(parsed.data.imageUrl),
      bio: blankToNull(parsed.data.bio),
      ...(parsed.data.links === undefined ? {} : { links: parsed.data.links }),
      ...(parsed.data.isActive === undefined
        ? {}
        : { isActive: parsed.data.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(speakers.id, speakerId))
    .returning({ id: speakers.id });

  if (!updated) {
    return { success: false, message: "Expositor no encontrado" } as const;
  }

  revalidateCatalog();

  return { success: true, message: "Expositor actualizado" } as const;
}
