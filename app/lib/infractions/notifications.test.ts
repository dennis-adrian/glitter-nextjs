import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));
vi.mock("@/db", () => ({ db: {} }));

import { getInfractionEmailSubject } from "@/app/emails/infraction-lifecycle";
import { getSanctionEmailSubject } from "@/app/emails/sanction-lifecycle";
import {
  COMPLETED_NOTIFICATION_JOB_RETENTION_MS,
  deliverDisciplinaryNotificationPayload,
  enqueueEnabledReservationAccessNotifications,
  enqueueInfractionLifecycleNotification,
  purgeCompletedDisciplinaryNotificationJobs,
  recordSanctionLifecycleNotificationEnqueueFailure,
  scrubDisciplinaryNotificationJobsForUser,
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
  const jobs = new Map<
    string,
    {
      id: number;
      payload: unknown;
      userId: number | null;
      lastError: string | null;
    }
  >();
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
      sanctions: {
        findFirst: vi.fn().mockResolvedValue({ userId: profile.id }),
      },
      disciplinaryNotificationJobs: {
        findFirst: vi.fn(() => {
          return Promise.resolve([...jobs.values()][0] ?? null);
        }),
      },
    },
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(
        (values: {
          deduplicationKey: string;
          payload: unknown;
          userId: number | null;
          lastError: string | null;
        }) => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(() => {
              if (jobs.has(values.deduplicationKey)) {
                return Promise.resolve([]);
              }
              const stored = {
                id: nextId++,
                payload: values.payload,
                userId: values.userId,
                lastError: values.lastError,
              };
              jobs.set(values.deduplicationKey, stored);
              return Promise.resolve([{ id: stored.id }]);
            }),
          })),
        }),
      ),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: { userId?: number; updatedAt?: Date }) => ({
        where: vi.fn(() => {
          const existing = [...jobs.values()].find(
            (job) => job.userId === null,
          );
          if (existing && values.userId !== undefined) {
            existing.userId = values.userId;
          }
          return Promise.resolve(undefined);
        }),
      })),
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
    expect(jobs.size).toBe(1);
    expect(tx.delete).toHaveBeenCalled();
  });

  it("persists failed sanction enqueue details for worker retry", async () => {
    const { tx, jobs } = createInfractionEnqueueTransaction();
    const now = new Date("2026-07-20T12:00:00.000Z");

    await recordSanctionLifecycleNotificationEnqueueFailure(
      tx as never,
      {
        sanctionId: 11,
        kind: "expired",
        deduplicationKey: "sanction:11:expired",
        now,
      },
      new Error("Missing participant"),
    );

    expect(jobs.get("sanction:11:expired")?.payload).toEqual({
      entityType: "sanction_enqueue_retry",
      sanctionId: 11,
      kind: "expired",
      participantNote: null,
      festivalName: null,
      reservationEligibleAt: null,
    });
    expect(jobs.get("sanction:11:expired")).toMatchObject({
      userId: profile.id,
      lastError: "Missing participant",
    });
  });

  it("repairs the owner on a deduplicated legacy sanction retry", async () => {
    const { tx, jobs } = createInfractionEnqueueTransaction();
    jobs.set("sanction:11:expired", {
      id: 77,
      payload: {
        entityType: "sanction_enqueue_retry",
        sanctionId: 11,
      },
      userId: null,
      lastError: "Missing participant",
    });

    await expect(
      recordSanctionLifecycleNotificationEnqueueFailure(
        tx as never,
        {
          sanctionId: 11,
          kind: "expired",
          deduplicationKey: "sanction:11:expired",
        },
        new Error("Missing participant"),
      ),
    ).resolves.toBe(77);

    expect(jobs.get("sanction:11:expired")?.userId).toBe(profile.id);
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
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
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

  it("continues reservation-access notifications after one missing profile", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const error = new Error("No se encontró al participante de la sanción");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const tx = {
      query: {
        users: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(profile),
        },
        sanctions: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({
              id: 8,
              userId: 80,
              type: "reservation_delay",
              status: "active",
              festivalScope: "glitter",
              sanctionInfractions: [],
            })
            .mockResolvedValueOnce({
              id: 9,
              userId: profile.id,
              type: "reservation_delay",
              status: "active",
              festivalScope: "glitter",
              sanctionInfractions: [],
            }),
        },
        disciplinaryNotificationJobs: {
          findFirst: vi.fn(),
        },
      },
      select: vi.fn(() => ({
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
                {
                  sanctionId: 9,
                  festivalId: 21,
                  festivalName: "Glitter Fest 2",
                  reservationEligibleAt: now,
                },
              ]),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ sanctionId: 9 }]),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 56 }]),
          })),
        })),
      })),
    };

    try {
      await expect(
        enqueueEnabledReservationAccessNotifications(tx as never, now),
      ).resolves.toEqual([56]);
      expect(tx.query.sanctions.findFirst).toHaveBeenCalledTimes(2);
      expect(tx.update).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        "[disciplinary-notifications] Failed to enqueue reservation-access notification",
        { sanctionId: 8, festivalId: 20, error },
      );
    } finally {
      consoleError.mockRestore();
    }
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

describe("disciplinary notification PII lifecycle", () => {
  it("purges completed jobs older than the retention window", async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn(() => ({ where: whereMock }));
    const now = new Date("2026-07-24T12:00:00.000Z");

    await purgeCompletedDisciplinaryNotificationJobs(
      { delete: deleteMock } as never,
      now,
    );

    expect(deleteMock).toHaveBeenCalledOnce();
    expect(whereMock).toHaveBeenCalledOnce();
    expect(COMPLETED_NOTIFICATION_JOB_RETENTION_MS).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("scrubs recipient email and payload while failing undelivered jobs", async () => {
    const written: Array<Record<string, unknown>> = [];
    const updateMock = vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        written.push(values);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    }));
    const now = new Date("2026-07-24T12:00:00.000Z");

    await scrubDisciplinaryNotificationJobsForUser(
      {
        query: {
          disciplinaryNotificationJobs: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
        update: updateMock,
      } as never,
      profile.id,
      now,
    );

    expect(written).toEqual([
      {
        status: "failed",
        lastError: "profile_deleted",
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      },
      {
        recipientEmail: "",
        payload: {},
        userId: null,
        updatedAt: now,
      },
    ]);
  });

  it("repairs or quarantines ownerless legacy sanction retries before scrubbing", async () => {
    const written: Array<Record<string, unknown>> = [];
    const updateMock = vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        written.push(values);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    }));
    const sanctionFindMany = vi.fn().mockResolvedValue([
      { id: 11, userId: profile.id },
      { id: 22, userId: 99 },
      { id: 44, userId: null },
    ]);
    const now = new Date("2026-07-24T12:00:00.000Z");

    await scrubDisciplinaryNotificationJobsForUser(
      {
        query: {
          disciplinaryNotificationJobs: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: 1,
                payload: {
                  entityType: "sanction_enqueue_retry",
                  sanctionId: 11,
                },
              },
              {
                id: 2,
                payload: {
                  entityType: "sanction_enqueue_retry",
                  sanctionId: 22,
                },
              },
              {
                id: 3,
                payload: {
                  entityType: "sanction_enqueue_retry",
                  sanctionId: 44,
                },
              },
              {
                id: 4,
                payload: {
                  entityType: "sanction_enqueue_retry",
                  sanctionId: 33,
                },
              },
            ]),
          },
          sanctions: {
            findMany: sanctionFindMany,
          },
        },
        update: updateMock,
      } as never,
      profile.id,
      now,
    );

    expect(sanctionFindMany).toHaveBeenCalledOnce();
    expect(written).toEqual([
      { userId: profile.id, updatedAt: now },
      { userId: 99, updatedAt: now },
      {
        status: "failed",
        recipientEmail: "",
        payload: {},
        lastError: "unresolved_sanction_retry_owner",
        userId: profile.id,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      },
      {
        status: "failed",
        recipientEmail: "",
        payload: {},
        lastError: "unresolved_sanction_retry_owner",
        userId: profile.id,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      },
      {
        status: "failed",
        lastError: "profile_deleted",
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      },
      {
        recipientEmail: "",
        payload: {},
        userId: null,
        updatedAt: now,
      },
    ]);
  });
});
