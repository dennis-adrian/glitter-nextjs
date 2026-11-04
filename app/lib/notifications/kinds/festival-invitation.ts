import { DateTime } from "luxon";
import { z } from "zod";

import { formatDisplayDate } from "@/app/lib/formatters";
import type { KindDefinition } from "@/app/lib/notifications/kinds/types";

/**
 * The Glitter copy of the activation invitation email
 * (`app/emails/festival-activation.tsx`): the festival is on, and when
 * reservations open. Sent from "Activar festival" next to the email, never
 * in its place; whether it also goes as a push is the admin's choice there.
 */

const participantInvitationSchema = z.object({
  festivalId: z.number().int().positive(),
  festivalName: z.string(),
  /** ISO; when reservations open, as the email says it. */
  reservationsStartDate: z.string(),
  /** Already open when it was sent: there is no date left to give. */
  reservationsOpen: z.boolean(),
});

export type FestivalParticipantInvitationData = z.infer<
  typeof participantInvitationSchema
>;

export const festivalInvitationKinds = {
  festival_participant_invitation: {
    category: "reservations",
    push: "per_send",
    schema: participantInvitationSchema,
    inApp: (data) => ({
      title: `Te invitamos a participar en ${data.festivalName}`,
      body: data.reservationsOpen
        ? "Las reservas ya están habilitadas. Leé con atención los términos y condiciones para participar."
        : `Las reservas se habilitarán el ${formatDisplayDate(
            data.reservationsStartDate,
            DateTime.DATE_FULL,
          )} a las ${formatDisplayDate(
            data.reservationsStartDate,
            DateTime.TIME_SIMPLE,
          )}. Hasta mientras, leé con atención los términos y condiciones.`,
      actionPath: `/festivals/${data.festivalId}/terms`,
      actionLabel: "Leer términos y condiciones",
    }),
  } satisfies KindDefinition<FestivalParticipantInvitationData>,
};
