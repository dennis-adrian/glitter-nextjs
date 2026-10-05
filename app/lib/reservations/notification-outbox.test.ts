import { render } from "react-email";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sendEmailMock, findReservationMock, selectMock, setCalls, claimed } =
  vi.hoisted(() => ({
    sendEmailMock: vi.fn(),
    findReservationMock: vi.fn(),
    selectMock: vi.fn(),
    setCalls: [] as Record<string, unknown>[],
    claimed: { current: null as Record<string, unknown> | null },
  }));

vi.mock("next/server", () => ({ after: vi.fn() }));

vi.mock("@/env", () => ({
  getClientEnv: () => ({ NEXT_PUBLIC_BASE_URL: "https://glitter.test" }),
  serverEnv: {},
}));

vi.mock("@/app/vendors/resend", () => ({ sendEmail: sendEmailMock }));

// Loose on purpose: the claim, complete and fail writes are only recorded, so
// a change to how the runner stamps a job does not break these delivery tests.
vi.mock("@/db", () => ({
  db: {
    query: { standReservations: { findFirst: findReservationMock } },
    select: selectMock,
    update: () => ({
      set: (values: Record<string, unknown>) => {
        setCalls.push(values);
        return {
          where: () =>
            Object.assign(Promise.resolve([]), {
              returning: async () => (claimed.current ? [claimed.current] : []),
            }),
        };
      },
    }),
  },
}));

import { attemptReservationNotificationJob } from "@/app/lib/reservations/notification-outbox";
import { users } from "@/db/schema";

const ANA = {
  id: 1,
  displayName: "Ana Ilustra",
  email: "ana@example.com",
  category: "illustration",
};
const CARLA = {
  id: 2,
  displayName: "Carla Dibuja",
  email: "carla@example.com",
  category: "illustration",
};
const ADMIN_EMAIL = "admin@example.com";
const STAND = {
  id: 5,
  label: "B",
  standNumber: 48,
  standCategory: "illustration",
};

function reservationFixture() {
  return {
    id: 42,
    festivalId: 7,
    ownerUserId: ANA.id,
    status: "accepted",
    stand: STAND,
    members: [{ position: 0, releasedAt: null, stand: STAND }],
    festival: {
      id: 7,
      name: "Glitter ¡Feliz Cumple!",
      locationLabel: "Galería del CBA",
      festivalType: "glitter",
      festivalDates: [
        {
          id: 1,
          startDate: new Date("2026-11-14T18:00:00.000Z"),
          endDate: new Date("2026-11-14T23:00:00.000Z"),
        },
      ],
    },
    participants: [
      { userId: ANA.id, user: ANA },
      { userId: CARLA.id, user: CARLA },
    ],
    invoices: [
      {
        id: 9,
        status: "pending",
        userId: ANA.id,
        user: ANA,
        dueAt: new Date("2026-10-07T22:00:00.000Z"),
        payments: [],
      },
    ],
  };
}

function queueJob(job: {
  kind: string;
  recipientEmail: string;
  reservationId?: number | null;
  payload?: Record<string, unknown>;
}) {
  claimed.current = {
    id: 1,
    notificationKind: job.kind,
    recipientEmail: job.recipientEmail,
    reservationId: job.reservationId === undefined ? 42 : job.reservationId,
    payload: job.payload ?? {},
    attempts: 0,
  };
}

async function sentEmail() {
  expect(sendEmailMock).toHaveBeenCalledTimes(1);
  const message = sendEmailMock.mock.calls[0][0] as {
    subject: string;
    react: React.ReactElement;
  };
  // React separates adjacent text nodes with `<!-- -->`, which would make a
  // negative assertion such as "no ¡Hola Ana" pass vacuously.
  const html = (await render(message.react)).replaceAll("<!-- -->", "");
  return { subject: message.subject, html };
}

describe("attemptReservationNotificationJob", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ data: { id: "email-1" } });
    findReservationMock.mockReset();
    findReservationMock.mockResolvedValue(reservationFixture());
    selectMock.mockReset();
    setCalls.length = 0;
    claimed.current = null;
  });

  describe("settlement_approved", () => {
    it("tells an admin about the participant instead of sending them the participant's confirmation", async () => {
      queueJob({ kind: "settlement_approved", recipientEmail: ADMIN_EMAIL });

      await attemptReservationNotificationJob(1);

      const { subject, html } = await sentEmail();
      expect(subject).toBe("Ana Ilustra confirmó su reserva con créditos");
      expect(html).toContain("/dashboard/festivals/7/reservations");
      expect(html).not.toContain("¡Tu reserva");
    });

    it("still sends the owner their own confirmation", async () => {
      queueJob({ kind: "settlement_approved", recipientEmail: ANA.email });

      await attemptReservationNotificationJob(1);

      const { subject, html } = await sentEmail();
      expect(subject).toBe(
        "Reserva confirmada para el festival Glitter ¡Feliz Cumple!",
      );
      expect(html).toContain("¡Hola Ana Ilustra!");
    });
  });

  describe("reservation_rejected", () => {
    it("greets each participant by their own name", async () => {
      queueJob({
        kind: "reservation_rejected",
        recipientEmail: CARLA.email,
        payload: { reason: "El pago no llegó a tiempo" },
      });

      await attemptReservationNotificationJob(1);

      const { html } = await sentEmail();
      expect(html).toContain("Carla Dibuja");
      expect(html).not.toContain("¡Hola Ana Ilustra");
      expect(html).toContain("El pago no llegó a tiempo");
    });

    it("retries rather than mailing someone who is not on the reservation", async () => {
      queueJob({
        kind: "reservation_rejected",
        recipientEmail: "stranger@example.com",
      });

      await attemptReservationNotificationJob(1);

      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(setCalls.at(-1)).toEqual(
        expect.objectContaining({
          status: "pending",
          lastError: "rejection_recipient_missing",
        }),
      );
    });
  });

  describe("deadline_extended", () => {
    it("links a partner to their own read-only view of the cobro", async () => {
      queueJob({ kind: "deadline_extended", recipientEmail: CARLA.email });

      await attemptReservationNotificationJob(1);

      const { subject, html } = await sentEmail();
      expect(subject).toBe(
        "Se extendió el plazo de pago de la reserva que compartís",
      );
      expect(html).toContain(
        "/profiles/2/festivals/7/reservations/42/payments",
      );
      expect(html).not.toContain("/profiles/1/");
    });

    it("links the payer to their own payments page", async () => {
      queueJob({ kind: "deadline_extended", recipientEmail: ANA.email });

      await attemptReservationNotificationJob(1);

      const { subject, html } = await sentEmail();
      expect(subject).toBe("Se extendió el plazo de pago de tu reserva");
      expect(html).toContain(
        "/profiles/1/festivals/7/reservations/42/payments",
      );
    });
  });

  describe("festival_participation_rejected", () => {
    it("carries the reason from the job payload into the email", async () => {
      selectMock.mockImplementation(() => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () =>
              table === users
                ? [{ ...ANA, id: 8 }]
                : [
                    {
                      id: 10,
                      name: "Glitter ¡Feliz Cumple!",
                      festivalType: "glitter",
                      reservationsStartDate: null,
                    },
                  ],
          }),
        }),
      }));
      queueJob({
        kind: "festival_participation_rejected",
        recipientEmail: ANA.email,
        reservationId: null,
        payload: { userId: 8, festivalId: 10, reason: "cupo completo" },
      });

      await attemptReservationNotificationJob(1);

      const { html } = await sentEmail();
      expect(html).toContain("cupo completo");
    });
  });
});
