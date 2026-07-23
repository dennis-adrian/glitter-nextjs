import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));
vi.mock("@/db", () => ({ db: {} }));

import { getInfractionEmailSubject } from "@/app/emails/infraction-lifecycle";
import { getSanctionEmailSubject } from "@/app/emails/sanction-lifecycle";
import {
  deliverDisciplinaryNotificationPayload,
  enqueueEnabledReservationAccessNotifications,
  enqueueInfractionLifecycleNotification,
  type DisciplinaryNotificationPayload,
} from "@/app/lib/infractions/notifications";

const profile = {
  id: 12,
  email: "participant@example.com",
  displayName: "Participante",
  firstName: null,
  lastName: null,
};

function createInfractionEnqueueTransaction() {
  const jobs = new Map<string, { id: number; payload: unknown }>();
  let nextId = 1;
  const tx = {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(profile),
      },
      infractions: {
        findFirst: vi.fn().mockResolvedValue({
          id: 42,
          type: { label: "No show" },
          festival: null,
        }),
      },
      disciplinaryNotificationJobs: {
        findFirst: vi.fn(({ where: _where }: { where: unknown }) => {
          return Promise.resolve([...jobs.values()][0] ?? null);
        }),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(
        (values: {
          deduplicationKey: string;
          payload: DisciplinaryNotificationPayload;
        }) => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(() => {
              if (jobs.has(values.deduplicationKey)) {
                return Promise.resolve([]);
              }
              const stored = { id: nextId++, payload: values.payload };
              jobs.set(values.deduplicationKey, stored);
              return Promise.resolve([{ id: stored.id }]);
            }),
          })),
        }),
      ),
    })),
  };

  return { tx, jobs };
}

describe("disciplinary email subjects", () => {
  it("uses concrete Spanish subjects for infraction events", () => {
    expect(getInfractionEmailSubject("registered")).toContain("infracción");
    expect(getInfractionEmailSubject("resolved")).toContain("resolvió");
    expect(getInfractionEmailSubject("voided")).toContain("anuló");
  });

  it("uses concrete Spanish subjects for sanction events", () => {
    expect(getSanctionEmailSubject("approved")).toContain("sanción");
    expect(getSanctionEmailSubject("expired")).toContain("Expiró");
    expect(getSanctionEmailSubject("revoked")).toContain("revocó");
    expect(getSanctionEmailSubject("reservation_access_enabled")).toContain(
      "reservas",
    );
  });
});

describe("disciplinary notification delivery", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
  });

  it("deduplicates the same lifecycle notification key", async () => {
    const { tx, jobs } = createInfractionEnqueueTransaction();
    const input = {
      userId: profile.id,
      infractionId: 42,
      kind: "registered" as const,
      deduplicationKey: "infraction:42:registered",
    };

    const firstId = await enqueueInfractionLifecycleNotification(
      tx as never,
      input,
    );
    const secondId = await enqueueInfractionLifecycleNotification(
      tx as never,
      input,
    );

    expect(firstId).toBe(secondId);
    expect(jobs).toHaveLength(1);
  });

  it("queues reservation-access delivery when the eligibility time is reached", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const insertedValues: Array<Record<string, unknown>> = [];
    let selectCall = 0;
    const tx = {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue(profile),
        },
        sanctions: {
          findFirst: vi.fn().mockResolvedValue({
            id: 8,
            userId: profile.id,
            type: "reservation_delay",
            status: "active",
            festivalScope: "glitter",
            sanctionInfractions: [{ infractionId: 42 }],
          }),
        },
        disciplinaryNotificationJobs: {
          findFirst: vi.fn(),
        },
      },
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn(() => ({
              innerJoin: vi.fn(() => ({
                innerJoin: vi.fn(() => ({
                  where: vi.fn().mockResolvedValue([
                    {
                      sanctionId: 8,
                      festivalId: 20,
                      festivalName: "Glitter Fest",
                      reservationEligibleAt: now,
                    },
                  ]),
                })),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([{ label: "Incumplimiento" }]),
            })),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ sanctionId: 8 }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertedValues.push(values);
          return {
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ id: 55 }]),
            })),
          };
        }),
      })),
    };

    await expect(
      enqueueEnabledReservationAccessNotifications(tx as never, now),
    ).resolves.toEqual([55]);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      deduplicationKey:
        "sanction:8:festival:20:reservation-access:2026-08-01T12:00:00.000Z",
      notificationKind: "reservation_access_enabled",
    });
    expect(insertedValues[0]?.payload).toMatchObject({
      kind: "reservation_access_enabled",
      festivalName: "Glitter Fest",
      reservationEligibleAt: "2026-08-01T12:00:00.000Z",
    });
  });

  it("sends one sanction email summarizing every linked infraction", async () => {
    sendEmailMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
    const payload: DisciplinaryNotificationPayload = {
      entityType: "sanction",
      kind: "approved",
      profile,
      sanctionId: 7,
      typeLabel: "Ban",
      statusLabel: "Activa",
      scopeLabel: "Global",
      infractionLabels: ["No show", "Incumplimiento"],
      participantNote: null,
      festivalName: null,
      reservationEligibleAt: null,
    };

    await expect(
      deliverDisciplinaryNotificationPayload(payload, "sanction:7:approved"),
    ).resolves.toEqual({ success: true });
    expect(sendEmailMock).toHaveBeenCalledOnce();

    const [email, options] = sendEmailMock.mock.calls[0] ?? [];
    expect(email.to).toEqual([profile.email]);
    expect(options).toEqual({ idempotencyKey: "sanction:7:approved" });
    expect(JSON.stringify(email.react)).toContain("No show");
    expect(JSON.stringify(email.react)).toContain("Incumplimiento");
  });

  it("does not include an administrative edit reason when no participant note was queued", async () => {
    sendEmailMock.mockResolvedValue({ data: { id: "email-2" }, error: null });
    const auditOnlyReason = "Corrección interna solicitada por dirección";
    const payload: DisciplinaryNotificationPayload = {
      entityType: "infraction",
      kind: "edited",
      profile,
      infractionId: 42,
      typeLabel: "No show",
      festivalName: null,
      participantNote: null,
    };

    await deliverDisciplinaryNotificationPayload(
      payload,
      "infraction:42:edited",
    );

    const email = sendEmailMock.mock.calls[0]?.[0];
    expect(JSON.stringify(email.react)).not.toContain(auditOnlyReason);
  });

  it("treats a provider error result as a failed delivery", async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Provider unavailable" },
    });
    const payload: DisciplinaryNotificationPayload = {
      entityType: "infraction",
      kind: "registered",
      profile,
      infractionId: 42,
      typeLabel: "No show",
      festivalName: "Glitter",
      participantNote: null,
    };

    await expect(
      deliverDisciplinaryNotificationPayload(
        payload,
        "infraction:42:registered",
      ),
    ).resolves.toEqual({
      success: false,
      error: "Provider unavailable",
    });
  });

  it("includes the exact festival access time in the access-enabled email", async () => {
    sendEmailMock.mockResolvedValue({ data: { id: "email-3" }, error: null });
    const payload: DisciplinaryNotificationPayload = {
      entityType: "sanction",
      kind: "reservation_access_enabled",
      profile,
      sanctionId: 8,
      typeLabel: "Retraso de reserva",
      statusLabel: "Activa",
      scopeLabel: "Glitter",
      infractionLabels: ["Incumplimiento"],
      participantNote: null,
      festivalName: "Glitter Fest",
      reservationEligibleAt: "2026-08-01T12:00:00.000Z",
    };

    await deliverDisciplinaryNotificationPayload(
      payload,
      "sanction:8:festival:20:reservation-access:2026-08-01T12:00:00.000Z",
    );

    const email = sendEmailMock.mock.calls[0]?.[0];
    expect(JSON.stringify(email.react)).toContain("Glitter Fest");
    expect(JSON.stringify(email.react)).toContain("Ya podés acceder");
  });

  it("reuses the persisted deduplication key as the provider idempotency key", async () => {
    sendEmailMock.mockResolvedValue({ data: { id: "email-4" }, error: null });
    const payload: DisciplinaryNotificationPayload = {
      entityType: "infraction",
      kind: "registered",
      profile,
      infractionId: 42,
      typeLabel: "No show",
      festivalName: null,
      participantNote: null,
    };
    const persistedKey = "infraction:42:registered";

    await deliverDisciplinaryNotificationPayload(payload, persistedKey);
    await deliverDisciplinaryNotificationPayload(payload, persistedKey);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: persistedKey,
    });
    expect(sendEmailMock.mock.calls[1]?.[1]).toEqual({
      idempotencyKey: persistedKey,
    });
  });
});
