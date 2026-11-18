import { fn } from "storybook/test";

// Storybook-only substitutes: the transfer dialog's stories never reach the
// database. The data is the worst case a phone has to fit: a long name and a
// long one-word email.
export const searchTransferCandidatesAction = fn(async () => [
  {
    id: 42,
    name: "María Fernanda de los Ángeles Quispe Mamani",
    email: "mariafernandadelosangelesquispemamani.ilustraciones@example.com",
    status: "verified",
  },
  {
    id: 43,
    name: "Mafe Ilustra",
    email: "mafe@example.com",
    status: "paused",
  },
]);

export const previewParticipantTransferAction = fn(async () => ({
  success: true as const,
  message: "Vista previa lista",
  data: {
    reservationId: 7,
    festivalName: "Festicker 4ta Edición - Halloween",
    status: "accepted",
    from: { id: 1, name: "Mafe", email: "mafe.vieja@example.com" },
    to: {
      id: 42,
      name: "María Fernanda de los Ángeles Quispe Mamani",
      email: "mariafernandadelosangelesquispemamani.ilustraciones@example.com",
    },
    plan: {
      movesHolding: true,
      enrollment: "move" as const,
      moves: [
        "La participación en la reserva",
        "La titularidad de la reserva",
        "1 cobro a su nombre",
        "Los recordatorios de pago",
        "3 productos enviados para el festival",
        "La inscripción al festival",
      ],
      warnings: [
        "Los Bs150 en créditos aplicados al cobro quedan registrados en la billetera de la cuenta de origen: si alguna vez se devuelven, vuelven a esa billetera.",
        "La cuenta de origen está inscrita en 2 actividades de este festival. Esas inscripciones no se mueven.",
      ],
    },
    planKey: '{"invoices":[11],"tasks":[3],"holding":true,"enrollment":"move"}',
  },
}));

export const transferReservationParticipationAction = fn(async () => ({
  success: true as const,
  message: "Participación transferida",
}));
