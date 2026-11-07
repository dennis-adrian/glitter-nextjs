import { z } from "zod";

import type { KindDefinition } from "@/app/lib/notifications/kinds/types";

/**
 * "Stands still available": a reminder an admin sends from the festival's
 * page (`app/lib/festivals/stands-available-reminders.ts`), only to
 * participants who still have a stand they could reserve. Its email is the
 * bulk lane's, so it has none here; whether it pushes is the sender's choice.
 */

export const STANDS_AVAILABLE_CATEGORIES = [
  "illustration",
  "gastronomy",
  "entrepreneurship",
] as const;

export type StandsAvailableCategory =
  (typeof STANDS_AVAILABLE_CATEGORIES)[number];

export const STANDS_AVAILABLE_CATEGORY_LABELS: Record<
  StandsAvailableCategory,
  string
> = {
  illustration: "Ilustración",
  gastronomy: "Gastronomía",
  entrepreneurship: "Emprendimiento",
};

const standsAvailableSchema = z.object({
  festivalId: z.number().int().positive(),
  festivalName: z.string(),
  /** The category the person's free stands are for. */
  category: z.enum(STANDS_AVAILABLE_CATEGORIES),
});

export type FestivalStandsAvailableData = z.infer<typeof standsAvailableSchema>;

export function standsAvailableCopy(data: FestivalStandsAvailableData) {
  return {
    title: `Todavía hay espacios disponibles en ${data.festivalName}`,
    body: `Quedan espacios de ${STANDS_AVAILABLE_CATEGORY_LABELS[data.category]} sin reservar. Reservá el tuyo antes de que se agoten.`,
  };
}

export const standsAvailableKinds = {
  festival_stands_available: {
    category: "reservations",
    push: "per_send",
    schema: standsAvailableSchema,
    inApp: (data) => ({
      ...standsAvailableCopy(data),
      actionPath: `/festivals/${data.festivalId}/terms`,
      actionLabel: "Reservar mi espacio",
    }),
  } satisfies KindDefinition<FestivalStandsAvailableData>,
};
