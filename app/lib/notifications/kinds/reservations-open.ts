import { z } from "zod";

import type { KindDefinition } from "@/app/lib/notifications/kinds/types";

/**
 * "Reservations are open": sent when a festival's reservations open, by the
 * cron (`app/lib/festivals/reservations-open-notices.ts`), and again whenever
 * an admin resends it. Its email is the bulk lane's
 * (`festival-notice-delivery.ts`), so it has none here. Whether it pushes
 * is the festival's setting, or the admin's choice on a resend.
 */

const reservationsOpenSchema = z.object({
  festivalId: z.number().int().positive(),
  festivalName: z.string(),
});

export type FestivalReservationsOpenData = z.infer<
  typeof reservationsOpenSchema
>;

export const reservationsOpenKinds = {
  festival_reservations_open: {
    category: "reservations",
    push: "per_send",
    schema: reservationsOpenSchema,
    inApp: (data) => ({
      title: `¡Ya abrieron las reservas para ${data.festivalName}!`,
      body: "Ya podés reservar tu espacio. Leé con atención los términos y condiciones antes de elegirlo.",
      actionPath: `/festivals/${data.festivalId}/terms`,
      actionLabel: "Reservar mi espacio",
    }),
  } satisfies KindDefinition<FestivalReservationsOpenData>,
};
