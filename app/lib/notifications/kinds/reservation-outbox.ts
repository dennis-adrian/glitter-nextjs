import { DateTime } from "luxon";
import { z } from "zod";

import { formatCreditCount } from "@/app/lib/credits/format";
import {
  formatDate,
  formatDisplayDate,
  formatFullDate,
} from "@/app/lib/formatters";
import { SUPPORT_LINE } from "@/app/lib/notifications/kinds/copy";
import type { KindDefinition } from "@/app/lib/notifications/kinds/types";
import { consoleHref } from "@/app/lib/reservations/console-lenses";

/**
 * The inbox copies of the reservation outbox's emails (phase 2). In-app only:
 * the outbox still sends each email, and `mirrorReservationNotificationJobs`
 * writes these in the same transaction that queues it.
 *
 * Each body says what its email says, shorter and without the greeting.
 * Partner copies never say what the owner paid.
 */

const reservationSchema = z.object({
  reservationId: z.number().int().positive(),
  festivalId: z.number().int().positive(),
  festivalName: z.string(),
  /** "B48" or "B48 y B49", what the reservation occupies. */
  standLabel: z.string(),
  standCount: z.number().int().min(1),
});

/** For the person the reservation belongs to (or is shared with). */
const participantReservationSchema = reservationSchema.extend({
  /** The recipient's own profile: every participant link sits under it. */
  profileId: z.number().int().positive(),
});

const roleSchema = z.enum(["owner", "partner"]);

const confirmedSchema = participantReservationSchema.extend({
  /** When the festival's first day starts, if it has dates. */
  startsAt: z.string().datetime().nullable(),
  locationLabel: z.string().nullable(),
});

const cancelledSchema = participantReservationSchema.extend({
  /** Typed by the admin who cancelled; the email shows it too. */
  reason: z.string().nullable(),
});

const deadlineExtendedSchema = participantReservationSchema.extend({
  role: roleSchema,
  /** Whose name the cobro is in; only they can upload the voucher. */
  ownerName: z.string(),
  dueAt: z.string().datetime(),
});

const releasedSchema = participantReservationSchema.extend({
  role: roleSchema,
  ownerName: z.string(),
  /** What releasing cost the owner. Null in a partner's copy. */
  creditPrice: z.number().min(0).nullable(),
});

const partnerAddedSchema = participantReservationSchema.extend({
  role: roleSchema,
  ownerName: z.string(),
  partnerName: z.string(),
  /** What adding the partner cost the owner. Null in the partner's copy. */
  totalCredits: z.number().min(0).nullable(),
});

const participationApprovedSchema = z.object({
  festivalId: z.number().int().positive(),
  festivalName: z.string(),
  reservationsStartDate: z.string().datetime().nullable(),
  /**
   * Decided when the item was written. The email decides when it is sent; an
   * item kept for months must keep saying what was true when it arrived.
   */
  reservationsOpen: z.boolean(),
});

const participationRejectedSchema = z.object({
  festivalId: z.number().int().positive(),
  festivalName: z.string(),
  /** The admin writes it for the participant ("Lo va a ver el participante"). */
  reason: z.string().nullable(),
});

const topUpRejectedSchema = z.object({
  topUpId: z.number().int().positive(),
  amount: z.number().positive(),
  /** Shown in the wallet too ("El participante ve este motivo"). */
  reason: z.string(),
  /**
   * The balance owed right after the rejection. It may include debt from
   * before it, so the copy never says this voucher caused all of it.
   */
  debtAmount: z.number().min(0),
});

const adminReservationSchema = reservationSchema.extend({
  /** Whose reservation it is: the cobro's holder, as the email names them. */
  participantName: z.string(),
});

type ParticipantReservation = z.infer<typeof participantReservationSchema>;

/** "el espacio B48" or "los espacios B48 y B49". */
function theStands(data: { standLabel: string; standCount: number }) {
  return data.standCount > 1
    ? `los espacios ${data.standLabel}`
    : `el espacio ${data.standLabel}`;
}

/** "del espacio B48" or "de los espacios B48 y B49". */
function ofTheStands(data: { standLabel: string; standCount: number }) {
  return data.standCount > 1
    ? `de los espacios ${data.standLabel}`
    : `del espacio ${data.standLabel}`;
}

function reservationPath(data: ParticipantReservation) {
  return `/profiles/${data.profileId}/festivals/${data.festivalId}/reservations/${data.reservationId}`;
}

/** "5 nov 2026 a las 6:00 PM", in Bolivia time. */
function dateAndTime(iso: string, dateFormat = DateTime.DATE_MED) {
  return `${formatDisplayDate(iso, dateFormat)} a las ${formatDisplayDate(iso, DateTime.TIME_SIMPLE)}`;
}

/** A reason or note as its own paragraph, read whole on the item's page. */
function withParagraph(body: string, label: string, text: string | null) {
  return text ? `${body}\n\n${label} ${text}` : body;
}

export const reservationOutboxKinds = {
  /** To the payer, once their voucher is in. A receipt for their own upload. */
  reservation_proof_submitted: {
    category: "credits",
    schema: participantReservationSchema,
    inApp: (data) => ({
      title: "Recibimos tu comprobante de pago",
      body: `Recibimos el comprobante que subiste para ${theStands(data)} en ${data.festivalName}. Te avisamos cuando confirmemos tu reserva.`,
      // The reservation, not its payments page: that one empties out once the
      // cobro is paid, and the item stays for months.
      actionPath: reservationPath(data),
      actionLabel: "Ver mi reserva",
    }),
    startsRead: () => true,
  } satisfies KindDefinition<ParticipantReservation>,

  /** To the owner of a Bs0 cobro, once they ask for it to be confirmed. */
  reservation_zero_value_review_requested: {
    category: "reservations",
    schema: participantReservationSchema,
    inApp: (data) => ({
      title: "Tu reserva está en revisión",
      body: `Registramos tu reserva sin costo ${ofTheStands(data)} en ${data.festivalName}. Te avisamos cuando la confirmemos.`,
      actionPath: reservationPath(data),
      actionLabel: "Ver mi reserva",
    }),
    startsRead: () => true,
  } satisfies KindDefinition<ParticipantReservation>,

  /** To the payer, when the reservation is confirmed by any route. */
  reservation_confirmed: {
    category: "reservations",
    schema: confirmedSchema,
    inApp: (data) => {
      // Setup starts an hour before the doors open, as the email says.
      const setup =
        data.startsAt && data.locationLabel
          ? ` Te esperamos el ${formatFullDate(new Date(data.startsAt))} en ${data.locationLabel} a las ${formatDisplayDate(formatDate(data.startsAt).minus({ hours: 1 }), DateTime.TIME_SIMPLE)} para armar ${data.standCount > 1 ? "tus espacios" : "tu espacio"}.`
          : " ¡Te esperamos!";
      return {
        title: "¡Tu reserva está confirmada!",
        body: `Confirmamos tu reserva ${ofTheStands(data)} en ${data.festivalName}.${setup}`,
        actionPath: reservationPath(data),
        actionLabel: "Ver mi reserva",
      };
    },
  } satisfies KindDefinition<z.infer<typeof confirmedSchema>>,

  /** To every participant of a reservation an admin cancelled. */
  reservation_cancelled: {
    category: "reservations",
    schema: cancelledSchema,
    inApp: (data) => ({
      title: "Tu reserva fue cancelada",
      body: withParagraph(
        `Cancelamos tu reserva ${ofTheStands(data)} en ${data.festivalName} y ${data.standCount > 1 ? "los espacios volvieron a quedar disponibles" : "el espacio volvió a quedar disponible"}.`,
        "Motivo:",
        data.reason,
      ),
      actionPath: reservationPath(data),
      actionLabel: "Ver la reserva",
    }),
    opensDetail: (data) => data.reason != null,
  } satisfies KindDefinition<z.infer<typeof cancelledSchema>>,

  /**
   * To every participant; only the owner can upload the voucher. Both link to
   * the reservation, which carries the new deadline and the owner's pay
   * button, and still makes sense after the cobro is paid.
   */
  reservation_payment_deadline_extended: {
    category: "credits",
    schema: deadlineExtendedSchema,
    inApp: (data) =>
      data.role === "owner"
        ? {
            title: "Tenés más tiempo para pagar tu reserva",
            body: `La nueva fecha límite es el ${dateAndTime(data.dueAt)}. Subí el comprobante antes para confirmar tu reserva ${ofTheStands(data)} en ${data.festivalName}.`,
            actionPath: reservationPath(data),
            actionLabel: "Ver mi reserva",
          }
        : {
            title: "Hay más tiempo para pagar la reserva que compartís",
            body: `La nueva fecha límite para pagar la reserva ${ofTheStands(data)} en ${data.festivalName} es el ${dateAndTime(data.dueAt)}. El cobro está a nombre de ${data.ownerName}, así que le toca subir el comprobante.`,
            actionPath: reservationPath(data),
            actionLabel: "Ver la reserva",
          },
  } satisfies KindDefinition<z.infer<typeof deadlineExtendedSchema>>,

  /** To the owner who released it and to the partner who is finding out. */
  reservation_released: {
    category: "reservations",
    schema: releasedSchema,
    inApp: (data) => {
      const freed =
        data.standCount > 1
          ? "Esos espacios volvieron al mapa y otra persona puede tomarlos."
          : "Ese espacio volvió al mapa y otra persona puede tomarlo.";
      // The map, not the reservation: the released reservation's page speaks
      // as its owner, which is wrong for a partner.
      const actionPath = `/profiles/${data.profileId}/festivals/${data.festivalId}/reservations/new`;
      if (data.role === "owner") {
        const cost =
          data.creditPrice && data.creditPrice > 0
            ? ` Se usaron ${formatCreditCount(data.creditPrice)} para liberarla y no se devuelven.`
            : "";
        return {
          title: "Liberaste tu reserva",
          body: `Liberaste tu reserva ${ofTheStands(data)} en ${data.festivalName}. ${freed}${cost}`,
          actionPath,
          actionLabel: "Ver espacios disponibles",
        };
      }
      return {
        title: "Se liberó la reserva que compartías",
        body: `${data.ownerName} liberó la reserva ${ofTheStands(data)} que compartían en ${data.festivalName}. ${freed} Podés hacer una nueva reserva si todavía queda lugar.`,
        actionPath,
        actionLabel: "Ver espacios disponibles",
      };
    },
    creditDelta: (data) =>
      data.role === "owner" && data.creditPrice ? -data.creditPrice : null,
    // The owner did it; the partner is finding out.
    startsRead: (data) => data.role === "owner",
  } satisfies KindDefinition<z.infer<typeof releasedSchema>>,

  /** To the owner who paid and to the partner who was added. */
  reservation_partner_added: {
    category: "reservations",
    schema: partnerAddedSchema,
    inApp: (data) =>
      data.role === "owner"
        ? {
            title: `Agregaste a ${data.partnerName} a tu reserva`,
            body: `Ahora compartís ${theStands(data)} en ${data.festivalName} con ${data.partnerName}. ${
              data.totalCredits
                ? `Se usaron ${formatCreditCount(data.totalCredits)} y tu cobro original no cambia.`
                : "Tu cobro original no cambia."
            }`,
            actionPath: reservationPath(data),
            actionLabel: "Ver mi reserva",
          }
        : {
            title: `${data.ownerName} te agregó a su reserva`,
            body: `Van a compartir ${theStands(data)} en ${data.festivalName}. No tenés que pagar nada: ${data.ownerName} ya se hizo cargo del costo.`,
            actionPath: reservationPath(data),
            actionLabel: "Ver la reserva",
          },
    creditDelta: (data) =>
      data.role === "owner" && data.totalCredits ? -data.totalCredits : null,
    startsRead: (data) => data.role === "owner",
  } satisfies KindDefinition<z.infer<typeof partnerAddedSchema>>,

  festival_participation_approved: {
    category: "reservations",
    schema: participationApprovedSchema,
    inApp: (data) => ({
      title: `Tu postulación para ${data.festivalName} fue aprobada`,
      body:
        data.reservationsOpen || !data.reservationsStartDate
          ? "Ya podés continuar con la reserva de tu espacio."
          : // Reservations open at an hour, not on a day.
            `Vas a poder reservar tu espacio desde el ${dateAndTime(data.reservationsStartDate, DateTime.DATE_FULL)}.`,
      actionPath: `/festivals/${data.festivalId}/terms`,
      actionLabel: "Reservar mi espacio",
    }),
  } satisfies KindDefinition<z.infer<typeof participationApprovedSchema>>,

  /** No action, as the email has none: the item opens its own page. */
  festival_participation_rejected: {
    category: "reservations",
    schema: participationRejectedSchema,
    inApp: (data) => ({
      title: `Novedades sobre tu postulación para ${data.festivalName}`,
      body: `${withParagraph(
        `Gracias por tu interés en participar en ${data.festivalName}. Lamentablemente, tu postulación no fue aprobada en esta ocasión.`,
        "El motivo que registramos es:",
        data.reason,
      )}\n\n${SUPPORT_LINE}`,
      actionPath: null,
      actionLabel: null,
    }),
    opensDetail: () => true,
  } satisfies KindDefinition<z.infer<typeof participationRejectedSchema>>,

  credit_top_up_rejected: {
    category: "credits",
    schema: topUpRejectedSchema,
    inApp: (data) => ({
      title: "No pudimos confirmar tu compra de créditos",
      body: `${withParagraph(
        `Revisamos el comprobante de tu compra de ${formatCreditCount(data.amount)} y no pudimos confirmarlo, así que descontamos esos créditos de tu billetera.${
          data.debtAmount > 0
            ? ` Con este ajuste te queda un saldo pendiente de ${formatCreditCount(data.debtAmount)}: hasta regularizarlo no vas a poder usar créditos. Lo que ya reservaste o activaste sigue en pie.`
            : ""
        }`,
        "Motivo:",
        data.reason,
      )}\n\n${SUPPORT_LINE}`,
      actionPath: "/my_credits",
      actionLabel: "Ver mi billetera",
    }),
    creditDelta: (data) => -data.amount,
    opensDetail: () => true,
  } satisfies KindDefinition<z.infer<typeof topUpRejectedSchema>>,

  /** Administración: a reservation was created, by its owner or an admin. */
  reservation_created_admin: {
    category: "admin",
    schema: adminReservationSchema,
    inApp: (data) => ({
      title: `Nueva reserva de ${data.participantName}`,
      body: `Se creó una reserva a nombre de ${data.participantName} para ${theStands(data)} en ${data.festivalName}.`,
      actionPath: `/dashboard/reservations/${data.reservationId}/edit`,
      actionLabel: "Ir a la reserva",
    }),
  } satisfies KindDefinition<z.infer<typeof adminReservationSchema>>,

  reservation_proof_submitted_admin: {
    category: "admin",
    schema: adminReservationSchema,
    inApp: (data) => ({
      title: `${data.participantName} subió el comprobante de su reserva`,
      body: `${data.participantName} subió un comprobante de pago para ${theStands(data)} en ${data.festivalName}. Está esperando revisión.`,
      actionPath: consoleHref({
        festivalId: data.festivalId,
        lens: "cobros",
        reservationId: data.reservationId,
      }),
      actionLabel: "Revisar el pago",
    }),
  } satisfies KindDefinition<z.infer<typeof adminReservationSchema>>,

  reservation_zero_value_review_requested_admin: {
    category: "admin",
    schema: adminReservationSchema,
    inApp: (data) => ({
      title: `${data.participantName} pidió revisar una reserva sin costo`,
      body: `La reserva de ${data.participantName} para ${theStands(data)} en ${data.festivalName} no tiene costo y está esperando revisión.`,
      actionPath: consoleHref({
        festivalId: data.festivalId,
        lens: "cobros",
        reservationId: data.reservationId,
      }),
      actionLabel: "Revisar la reserva",
    }),
  } satisfies KindDefinition<z.infer<typeof adminReservationSchema>>,

  /** Only when credits confirmed it on their own, with nobody approving. */
  reservation_confirmed_with_credits_admin: {
    category: "admin",
    schema: adminReservationSchema,
    inApp: (data) => ({
      title: `${data.participantName} confirmó su reserva con créditos`,
      body: `${data.participantName} cubrió con créditos el saldo de su reserva para ${theStands(data)} en ${data.festivalName}. Quedó confirmada sin comprobante que revisar.`,
      actionPath: consoleHref({
        festivalId: data.festivalId,
        lens: "creditos",
        reservationId: data.reservationId,
      }),
      actionLabel: "Ver la reserva",
    }),
  } satisfies KindDefinition<z.infer<typeof adminReservationSchema>>,
} as const;
