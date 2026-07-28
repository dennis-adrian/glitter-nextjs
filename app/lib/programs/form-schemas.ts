import { z } from "zod";

/**
 * Form schemas keep every field a string, the way the inputs produce them, and
 * the submit handlers convert to the action's typed input. The server action
 * re-validates with its own schema — that is the real boundary, and this layer
 * exists only to give the admin inline errors before a round trip.
 */

const optionalText = z.string().trim().optional();

export const programFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  summary: optionalText,
  description: optionalText,
  bannerUrl: optionalText,
  thumbnailUrl: optionalText,
  startDate: optionalText,
  endDate: optionalText,
  festivalId: optionalText,
  defaultVenueId: optionalText,
  participantDiscountPercent: optionalText,
});

export const sessionFormSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio"),
  type: z.enum(["talk", "workshop"]),
  audience: z.enum(["all", "participants_only", "public_only"]),
  topic: optionalText,
  description: optionalText,
  learningOutcomes: optionalText,
  skillLevel: optionalText,
  imageUrl: optionalText,
  publicPrice: z.string().trim().min(1, "El precio público es obligatorio"),
  participantPrice: optionalText,
  venueId: optionalText,
  displayOrder: optionalText,
});

export const occurrenceFormSchema = z.object({
  startsAt: z.string().trim().min(1, "La fecha de inicio es obligatoria"),
  endsAt: z.string().trim().min(1, "La fecha de fin es obligatoria"),
  venueId: optionalText,
  room: optionalText,
  capacity: optionalText,
  salesStartAt: optionalText,
  salesEndAt: optionalText,
});

export const rescheduleFormSchema = z.object({
  startsAt: z.string().trim().min(1, "La fecha de inicio es obligatoria"),
  endsAt: z.string().trim().min(1, "La fecha de fin es obligatoria"),
  venueId: optionalText,
  room: optionalText,
  reason: z.string().trim().min(1, "El motivo es obligatorio"),
});

export const venueFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  address: optionalText,
  locationLabel: optionalText,
  locationUrl: optionalText,
});

export const speakerFormSchema = z.object({
  publicName: z.string().trim().min(1, "El nombre es obligatorio"),
  imageUrl: optionalText,
  bio: optionalText,
});

export type ProgramFormValues = z.infer<typeof programFormSchema>;
export type SessionFormValues = z.infer<typeof sessionFormSchema>;
export type OccurrenceFormValues = z.infer<typeof occurrenceFormSchema>;
export type RescheduleFormValues = z.infer<typeof rescheduleFormSchema>;
export type VenueFormValues = z.infer<typeof venueFormSchema>;
export type SpeakerFormValues = z.infer<typeof speakerFormSchema>;

/** `""` → null, so an emptied optional field clears rather than stores blank. */
export function textOrNull(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function numberOrNull(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function idOrNull(value: string | undefined): number | null {
  const parsed = numberOrNull(value);
  return parsed && parsed > 0 ? parsed : null;
}

export function dateOrNull(value: string | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Newline-separated textarea → array, dropping blank lines. */
export function linesToArray(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function arrayToLines(value: string[] | null | undefined): string {
  return (value ?? []).join("\n");
}

/** `datetime-local` needs `YYYY-MM-DDTHH:mm` with no timezone suffix. */
export function toDateTimeLocal(value: Date | null | undefined): string {
  if (!value) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return [
    value.getFullYear(),
    "-",
    pad(value.getMonth() + 1),
    "-",
    pad(value.getDate()),
    "T",
    pad(value.getHours()),
    ":",
    pad(value.getMinutes()),
  ].join("");
}
