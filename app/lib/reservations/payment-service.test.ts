import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const enqueueNotificationsMock = vi.hoisted(() => vi.fn());
const scheduleJobsMock = vi.hoisted(() => vi.fn());
const insertEventMock = vi.hoisted(() => vi.fn());
const claimRequestMock = vi.hoisted(() => vi.fn());
const completeRequestMock = vi.hoisted(() => vi.fn());
const abandonRequestMock = vi.hoisted(() => vi.fn());
const applyReservationCancellationMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([]),
);
const debitConfirmedCreditsMock = vi.hoisted(() => vi.fn());
const creditBalancesMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    select: selectMock,
    query: {
      invoices: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/lib/credits/service", () => ({
  debitConfirmedCreditsForInvoiceInTx: debitConfirmedCreditsMock,
  getCreditBalancesInTx: creditBalancesMock,
}));

const lockCallOrder = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock("@/app/lib/reservations/locks", () => ({
  uniqueSortedIds: (ids: readonly number[]) =>
    [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort(
      (a, b) => a - b,
    ),
  lockParticipantsBeforeRegistryClaim: vi.fn(),
  lockReservationAggregate: vi.fn(
    async (
      _tx: unknown,
      preview: {
        userIds: readonly number[];
        submissionIds?: readonly number[];
      },
    ) => {
      lockCallOrder.current.push(
        "advisory",
        "festival",
        "terms",
        "eligibility",
        "credit_account",
        "stand",
      );
      if ((preview.submissionIds?.length ?? 0) > 0) {
        lockCallOrder.current.push("submission");
      }
      const userIds = [
        ...new Set(
          preview.userIds.filter((id) => Number.isInteger(id) && id > 0),
        ),
      ].sort((a, b) => a - b);
      return {
        ok: true,
        locked: {
          festivalId: 10,
          userIds,
          standIds: [7],
          holdIds: [],
          reservationIds: [4],
          invoiceIds: [9],
          paymentIds: [],
          submissionIds: preview.submissionIds ?? [],
          scheduledTaskIds: [],
          participantsByReservationId: new Map(),
        },
      };
    },
  ),
}));

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: enqueueNotificationsMock,
  scheduleReservationNotificationJobs: scheduleJobsMock,
}));

vi.mock("@/app/lib/reservations/events", () => ({
  insertStandReservationEvent: insertEventMock,
}));

vi.mock("@/app/lib/reservations/request-registry", () => ({
  claimRequest: claimRequestMock,
  completeRequest: completeRequestMock,
  abandonRequest: abandonRequestMock,
}));

vi.mock("@/app/lib/reservations/admin-service", () => ({
  applyReservationCancellation: applyReservationCancellationMock,
}));

vi.mock("@/app/lib/uploadthing/actions", () => ({
  enqueueStorageCleanupJob: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  adminConfirmReservation,
  applyInvoiceCredits,
  approveInvoiceSettlement,
  correctSettlementProof,
  findSubmittedSettlementInvoiceIdForReservation,
  rejectInvoiceSettlement,
  submitPaymentProof,
  submitZeroValueInvoiceForReview,
} from "@/app/lib/reservations/payment-service";
import {
  invoiceSettlementSubmissions,
  invoiceCreditAllocations,
  invoices,
  payments,
  reservationParticipants,
  standReservations,
  users,
} from "@/db/schema";

type LockedInvoice = {
  id: number;
  userId: number;
  status: "pending" | "verification_payment" | "paid" | "cancelled";
  amount: number | string;
  originalAmount?: number | string;
  discountAmount?: number | string;
  discountCodeId?: number | null;
  reservationId: number;
};

type ExistingSettlement = {
  id: number;
  invoiceId?: number;
  uploadedByUserId?: number;
  status?: string;
  kind?: string;
  paymentId?: number | null;
};

function createTx(options: {
  invoice: LockedInvoice;
  reservation?: {
    id?: number;
    standId: number;
    status: string;
    festivalId?: number;
  };
  payments?: Array<{
    id: number;
    invoiceId: number;
    amount: number | string;
    date: Date;
    voucherUrl: string | null;
    fileKey?: string | null;
    idempotencyKey?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  existingSettlement?: ExistingSettlement | null;
  invoiceCreditAmount?: number;
  approvedCashAmount?: number;
  ownerEmail?: string;
}) {
  const reservation = {
    id: options.invoice.reservationId,
    standId: options.reservation?.standId ?? 7,
    status: options.reservation?.status ?? "pending",
    festivalId: options.reservation?.festivalId ?? 10,
  };
  const invoicePayments = options.payments ?? [];
  const inserted: unknown[] = [];
  const updates: unknown[] = [];
  const settlementWhere: unknown[] = [];
  let invoiceCreditAmount = options.invoiceCreditAmount ?? 0;

  const tx = {
    inserted,
    updates,
    settlementWhere,
    select: vi.fn((fields?: Record<string, unknown>) => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn((clause: unknown) => {
          if (table === invoiceSettlementSubmissions) {
            settlementWhere.push(clause);
            const submission = options.existingSettlement;
            const rows = submission
              ? [
                  {
                    id: submission.id,
                    invoiceId: submission.invoiceId ?? options.invoice.id,
                    uploadedByUserId:
                      submission.uploadedByUserId ?? options.invoice.userId,
                    status: submission.status ?? "submitted",
                    kind: submission.kind ?? "payment_proof",
                    paymentId: submission.paymentId ?? null,
                  },
                ]
              : [];
            const limited = Object.assign(Promise.resolve(rows), {
              for: vi.fn(() => {
                lockCallOrder.current.push("submission");
                return Promise.resolve(rows);
              }),
            });
            return Object.assign(Promise.resolve(rows), {
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => limited),
              })),
              limit: vi.fn(() => limited),
            });
          }
          if (table === payments) {
            if (fields && "amount" in fields) {
              if ("invoiceId" in fields) {
                const payment = invoicePayments[0];
                const rows = payment
                  ? [{ amount: payment.amount, invoiceId: payment.invoiceId }]
                  : [];
                return {
                  limit: vi.fn(() => ({
                    for: vi.fn().mockResolvedValue(rows),
                  })),
                };
              }
              return Promise.resolve([
                { amount: options.approvedCashAmount ?? 0 },
              ]);
            }
            const paymentRows = invoicePayments;
            return Object.assign(Promise.resolve(paymentRows), {
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue(invoicePayments.slice(0, 1)),
              })),
            });
          }
          if (table === invoiceCreditAllocations) {
            return Promise.resolve([{ amount: invoiceCreditAmount }]);
          }
          if (table === users) {
            return {
              limit: vi
                .fn()
                .mockResolvedValue([
                  { email: options.ownerEmail ?? "ada@example.com" },
                ]),
            };
          }
          if (table === reservationParticipants) {
            return Promise.resolve([]);
          }
          const rows =
            table === invoices
              ? [options.invoice]
              : table === standReservations
                ? [reservation]
                : [];
          return {
            limit: vi.fn(() =>
              Object.assign(Promise.resolve(rows), {
                for: vi.fn().mockResolvedValue(rows),
              }),
            ),
          };
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (values: unknown) => {
        inserted.push(values);
        if (
          table === invoiceCreditAllocations &&
          typeof values === "object" &&
          values != null &&
          "amount" in values
        ) {
          invoiceCreditAmount = Number((values as { amount: unknown }).amount);
        }
        return {
          returning: vi.fn().mockResolvedValue([{ id: 99 }]),
        };
      },
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        updates.push(values);
        return {
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 99 }]),
          })),
        };
      },
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
  };

  return tx;
}

describe("submitPaymentProof", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueNotificationsMock.mockReset();
    scheduleJobsMock.mockReset();
    insertEventMock.mockReset();
    claimRequestMock.mockReset();
    completeRequestMock.mockReset();
    abandonRequestMock.mockReset();
    claimRequestMock.mockResolvedValue({ kind: "claimed" });
    enqueueNotificationsMock.mockResolvedValue([1]);
  });

  it("rejects unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    const result = await submitPaymentProof({
      invoiceId: 9,
      fileKey: "uploadthing-key",
      source: "uploadthing",
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toMatchObject({ success: false, code: "UNAUTHENTICATED" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a caller who does not own the invoice", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "user" });
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "pending",
              amount: 150,
              reservationId: 4,
            },
          }),
        ),
    );

    const result = await submitPaymentProof({
      invoiceId: 9,
      fileKey: "uploadthing-key",
      source: "uploadthing",
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toMatchObject({ success: false, code: "INVOICE_NOT_OWNED" });
  });

  it("returns CONFLICT_RETRY when the request registry rejects the key", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    claimRequestMock.mockResolvedValue({ kind: "conflict" });
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "pending",
              amount: 150,
              reservationId: 4,
            },
          }),
        ),
    );

    const result = await submitPaymentProof({
      invoiceId: 9,
      fileKey: "uploadthing-key",
      source: "uploadthing",
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toMatchObject({ success: false, code: "CONFLICT_RETRY" });
  });

  it("ignores a caller-supplied amount and uses the canonical invoice amount", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    let tx: ReturnType<typeof createTx> | undefined;
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => {
        tx = createTx({
          invoice: {
            id: 9,
            userId: 8,
            status: "pending",
            amount: 150,
            originalAmount: 150,
            discountAmount: 0,
            reservationId: 4,
          },
        });
        return callback(tx);
      },
    );

    await submitPaymentProof({
      invoiceId: 9,
      fileKey: "uploadthing-key",
      source: "uploadthing",
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      amount: 1,
    });

    expect(tx?.inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invoiceId: 9,
          amount: 150,
          voucherUrl: "https://files.example.com/f/abc",
        }),
      ]),
    );
    expect(tx?.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "verification_payment" }),
      ]),
    );
    expect(scheduleJobsMock).toHaveBeenCalledWith([1]);
  });

  it("updates the newest payment row when one already exists", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    let tx: ReturnType<typeof createTx> | undefined;
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => {
        tx = createTx({
          invoice: {
            id: 9,
            userId: 8,
            status: "pending",
            amount: 150,
            originalAmount: 150,
            discountAmount: 0,
            reservationId: 4,
          },
          payments: [
            {
              id: 11,
              invoiceId: 9,
              amount: 150,
              date: new Date("2026-01-02T00:00:00.000Z"),
              voucherUrl: "https://files.example.com/new.pdf",
              createdAt: new Date("2026-01-02T00:00:00.000Z"),
              updatedAt: new Date("2026-01-02T00:00:00.000Z"),
            },
          ],
        });
        return callback(tx);
      },
    );

    await submitPaymentProof({
      invoiceId: 9,
      fileKey: "uploadthing-key",
      source: "uploadthing",
      voucherUrl: "https://files.example.com/replacement.pdf",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(tx?.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          voucherUrl: "https://files.example.com/replacement.pdf",
        }),
      ]),
    );
  });

  it("sets the voucher amount to the remainder after credit allocation", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    let tx: ReturnType<typeof createTx> | undefined;
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => {
        tx = createTx({
          invoice: {
            id: 9,
            userId: 8,
            status: "pending",
            amount: 150,
            originalAmount: 150,
            discountAmount: 0,
            reservationId: 4,
          },
          invoiceCreditAmount: 40,
        });
        return callback(tx);
      },
    );

    await submitPaymentProof({
      invoiceId: 9,
      fileKey: "uploadthing-key",
      source: "uploadthing",
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(tx?.inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invoiceId: 9, amount: 110 }),
      ]),
    );
  });

  it("replays when the registry returns a completed submission", async () => {
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    claimRequestMock.mockResolvedValue({
      kind: "replayed",
      resultIds: { submissionId: 21 },
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "pending",
              amount: 150,
              reservationId: 4,
            },
          }),
        ),
    );

    const result = await submitPaymentProof({
      invoiceId: 9,
      fileKey: "uploadthing-key",
      source: "uploadthing",
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey,
    });

    expect(result).toMatchObject({
      success: true,
      message:
        "Ya enviamos un comprobante para esta factura. Esperá la revisión.",
    });
  });

  it("acquires festival, user, and stand locks in §4.4 order", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => {
        const tx = createTx({
          invoice: {
            id: 9,
            userId: 8,
            status: "pending",
            amount: 150,
            originalAmount: 150,
            discountAmount: 0,
            reservationId: 4,
          },
          reservation: { standId: 7, status: "pending", festivalId: 10 },
        });
        return callback(tx);
      },
    );

    await submitPaymentProof({
      invoiceId: 9,
      fileKey: "uploadthing-key",
      source: "uploadthing",
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(lockCallOrder.current).toEqual([
      "advisory",
      "festival",
      "terms",
      "eligibility",
      "credit_account",
      "stand",
    ]);
  });
});

describe("applyInvoiceCredits", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    claimRequestMock.mockReset();
    completeRequestMock.mockReset();
    abandonRequestMock.mockReset();
    debitConfirmedCreditsMock.mockReset();
    creditBalancesMock.mockReset();
    enqueueNotificationsMock.mockReset();
    scheduleJobsMock.mockReset();
    claimRequestMock.mockResolvedValue({ kind: "claimed" });
    enqueueNotificationsMock.mockResolvedValue([44]);
    debitConfirmedCreditsMock.mockResolvedValue({
      ok: true,
      data: { ledgerEntryId: 71, balances: {} },
    });
  });

  function installPendingInvoiceTransaction(amount = 150) {
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "pending",
              amount,
              originalAmount: amount,
              discountAmount: 0,
              reservationId: 4,
            },
          }),
        ),
    );
  }

  it("allocates the maximum confirmed balance and fulfills a fully covered invoice", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    creditBalancesMock.mockResolvedValue({ invoiceEligibleBalance: 150 });
    installPendingInvoiceTransaction();

    const result = await applyInvoiceCredits({
      invoiceId: 9,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(debitConfirmedCreditsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 8, amount: 150 }),
    );
    expect(result).toMatchObject({
      success: true,
      data: { allocationId: 99, amount: 150, outstandingAmount: 0 },
    });
    expect(completeRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ allocationId: 99, outstandingAmount: 0 }),
    );
    expect(enqueueNotificationsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "settlement_approved" }),
    );
    expect(scheduleJobsMock).toHaveBeenCalledWith([44]);
  });

  it("keeps a partially credit-funded invoice pending for the voucher remainder", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    creditBalancesMock.mockResolvedValue({ invoiceEligibleBalance: 40 });
    installPendingInvoiceTransaction(150);

    const result = await applyInvoiceCredits({
      invoiceId: 9,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(debitConfirmedCreditsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 40 }),
    );
    expect(result).toMatchObject({
      success: true,
      data: { amount: 40, outstandingAmount: 110 },
    });
  });

  it("does not debit provisional-only credit", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    creditBalancesMock.mockResolvedValue({ invoiceEligibleBalance: 0 });
    installPendingInvoiceTransaction();

    const result = await applyInvoiceCredits({
      invoiceId: 9,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toMatchObject({
      success: false,
      code: "INSUFFICIENT_CREDITS",
    });
    expect(debitConfirmedCreditsMock).not.toHaveBeenCalled();
  });
});

describe("submitZeroValueInvoiceForReview", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueNotificationsMock.mockResolvedValue([]);
    claimRequestMock.mockReset();
    completeRequestMock.mockReset();
    abandonRequestMock.mockReset();
    claimRequestMock.mockResolvedValue({ kind: "claimed" });
  });

  it("rejects a second review request on an in-review invoice", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 0,
              reservationId: 4,
            },
            reservation: {
              standId: 7,
              status: "verification_payment",
            },
          }),
        ),
    );

    const result = await submitZeroValueInvoiceForReview({
      invoiceId: 9,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toMatchObject({
      success: false,
      code: "PAYMENT_ALREADY_SUBMITTED",
    });
  });
});

describe("adminConfirmReservation", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    claimRequestMock.mockReset();
    completeRequestMock.mockReset();
    abandonRequestMock.mockReset();
    scheduleJobsMock.mockReset();
    claimRequestMock.mockResolvedValue({ kind: "claimed" });
  });

  it("rejects non-admin callers", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "user" });
    const result = await adminConfirmReservation({
      invoiceId: 9,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toMatchObject({ success: false, code: "UNAUTHORIZED" });
  });

  it("locks festival, user_requests/users, then stand before post-lock checks", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 150,
              reservationId: 4,
            },
            reservation: {
              standId: 7,
              status: "verification_payment",
              festivalId: 10,
            },
          }),
        ),
    );

    await adminConfirmReservation({
      invoiceId: 9,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(lockCallOrder.current.slice(0, 6)).toEqual([
      "advisory",
      "festival",
      "terms",
      "eligibility",
      "credit_account",
      "stand",
    ]);
  });
});

describe("approveInvoiceSettlement", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueNotificationsMock.mockReset();
    scheduleJobsMock.mockReset();
    insertEventMock.mockReset();
    enqueueNotificationsMock.mockResolvedValue([1]);
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
  });

  it("locks festival, user_requests/users, then stand before the submission row", async () => {
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 150,
              reservationId: 4,
            },
            reservation: {
              standId: 7,
              status: "verification_payment",
              festivalId: 10,
            },
            existingSettlement: {
              id: 21,
              invoiceId: 9,
              status: "submitted",
              kind: "payment_proof",
              paymentId: null,
            },
          }),
        ),
    );

    const result = await approveInvoiceSettlement({ submissionId: 21 });

    expect(result).toMatchObject({ success: false, code: "VALIDATION" });
    expect(lockCallOrder.current.slice(0, 6)).toEqual([
      "advisory",
      "festival",
      "terms",
      "eligibility",
      "credit_account",
      "stand",
    ]);
  });

  it("keeps post-lock submission status checks", async () => {
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 150,
              reservationId: 4,
            },
            existingSettlement: {
              id: 21,
              invoiceId: 9,
              status: "rejected",
              kind: "payment_proof",
              paymentId: 3,
            },
          }),
        ),
    );

    const result = await approveInvoiceSettlement({ submissionId: 21 });
    expect(result).toMatchObject({
      success: false,
      code: "INVOICE_NOT_PENDING",
    });
    expect(lockCallOrder.current.slice(0, 6)).toEqual([
      "advisory",
      "festival",
      "terms",
      "eligibility",
      "credit_account",
      "stand",
    ]);
  });

  it("does not approve a submitted proof after its reservation was rejected", async () => {
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 150,
              reservationId: 4,
            },
            reservation: {
              standId: 7,
              status: "rejected",
              festivalId: 10,
            },
            existingSettlement: {
              id: 21,
              invoiceId: 9,
              status: "submitted",
              kind: "payment_proof",
              paymentId: 3,
            },
          }),
        ),
    );

    const result = await approveInvoiceSettlement({ submissionId: 21 });

    expect(result).toMatchObject({
      success: false,
      code: "INVOICE_NOT_PENDING",
    });
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("approves when approved cash, credits, and the proof exactly cover the invoice", async () => {
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 150,
              reservationId: 4,
            },
            reservation: { standId: 7, status: "verification_payment" },
            approvedCashAmount: 30,
            invoiceCreditAmount: 40,
            payments: [
              {
                id: 3,
                invoiceId: 9,
                amount: 80,
                date: new Date(),
                voucherUrl: "https://files.example.com/proof",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            existingSettlement: { id: 21, invoiceId: 9, paymentId: 3 },
          }),
        ),
    );

    await expect(
      approveInvoiceSettlement({ submissionId: 21 }),
    ).resolves.toMatchObject({
      success: true,
    });
  });

  it("rejects a proof when mixed tender does not cover the invoice", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 150,
              reservationId: 4,
            },
            reservation: { standId: 7, status: "verification_payment" },
            approvedCashAmount: 30,
            invoiceCreditAmount: 40,
            payments: [
              {
                id: 3,
                invoiceId: 9,
                amount: 79,
                date: new Date(),
                voucherUrl: "https://files.example.com/proof",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            existingSettlement: { id: 21, invoiceId: 9, paymentId: 3 },
          }),
        ),
    );

    await expect(
      approveInvoiceSettlement({ submissionId: 21 }),
    ).resolves.toMatchObject({
      success: false,
      code: "PAYMENT_AMOUNT_MISMATCH",
    });
    expect(warn).toHaveBeenCalledWith(
      "Settlement tender amount mismatch",
      expect.objectContaining({ coveredAmount: 70, submittedCashAmount: 79 }),
    );
    warn.mockRestore();
  });
});

describe("rejectInvoiceSettlement", () => {
  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueNotificationsMock.mockReset();
    scheduleJobsMock.mockReset();
    insertEventMock.mockReset();
    applyReservationCancellationMock.mockClear();
    enqueueNotificationsMock.mockResolvedValue([1]);
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
  });

  it("rejects keep_amount correction for zero-value entitlement submissions", async () => {
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 0,
              originalAmount: 150,
              reservationId: 4,
            },
            reservation: {
              standId: 7,
              status: "verification_payment",
              festivalId: 10,
            },
            existingSettlement: {
              id: 21,
              invoiceId: 9,
              status: "submitted",
              kind: "zero_value_entitlement",
              paymentId: null,
            },
          }),
        ),
    );

    const result = await rejectInvoiceSettlement({
      submissionId: 21,
      reason: "No corresponde",
      correction: { type: "keep_amount" },
    });

    expect(result).toMatchObject({ success: false, code: "VALIDATION" });
    expect(lockCallOrder.current.slice(0, 7)).toEqual([
      "advisory",
      "festival",
      "terms",
      "eligibility",
      "credit_account",
      "stand",
      "submission",
    ]);
    expect(scheduleJobsMock).not.toHaveBeenCalled();
  });

  it("cancels the invoice when an admin rejects its proof and cancels the reservation", async () => {
    const tx = createTx({
      invoice: {
        id: 9,
        userId: 8,
        status: "verification_payment",
        amount: 150,
        reservationId: 4,
      },
      reservation: {
        standId: 7,
        status: "verification_payment",
        festivalId: 10,
      },
      existingSettlement: {
        id: 21,
        invoiceId: 9,
        status: "submitted",
        kind: "payment_proof",
        paymentId: 3,
      },
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await rejectInvoiceSettlement({
      submissionId: 21,
      reason: "Comprobante rechazado; cancelar reserva",
      correction: { type: "cancel_reservation" },
    });

    expect(result.success).toBe(true);
    expect(applyReservationCancellationMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        reservation: expect.objectContaining({ id: 4 }),
        eventType: "settlement_rejected",
      }),
    );
    expect(tx.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "rejected" }),
        expect.objectContaining({ status: "cancelled" }),
      ]),
    );
  });

  it("does not return a rejected reservation to pending", async () => {
    const tx = createTx({
      invoice: {
        id: 9,
        userId: 8,
        status: "verification_payment",
        amount: 150,
        reservationId: 4,
      },
      reservation: {
        standId: 7,
        status: "rejected",
        festivalId: 10,
      },
      existingSettlement: {
        id: 21,
        invoiceId: 9,
        status: "submitted",
        kind: "payment_proof",
        paymentId: 3,
      },
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await rejectInvoiceSettlement({
      submissionId: 21,
      reason: "Revisión administrativa",
      correction: { type: "keep_amount" },
    });

    expect(result).toMatchObject({
      success: false,
      code: "INVOICE_NOT_PENDING",
    });
    expect(tx.updates).toEqual([]);
    expect(insertEventMock).not.toHaveBeenCalled();
  });
});

describe("correctSettlementProof", () => {
  const idempotencyKey = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    lockCallOrder.current = [];
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueNotificationsMock.mockReset();
    scheduleJobsMock.mockReset();
    insertEventMock.mockReset();
    claimRequestMock.mockReset();
    completeRequestMock.mockReset();
    abandonRequestMock.mockReset();
    claimRequestMock.mockResolvedValue({ kind: "claimed" });
    enqueueNotificationsMock.mockResolvedValue([1]);
  });

  it("rejects unauthenticated and festival_admin callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(
      correctSettlementProof({ invoiceId: 9, reason: "ilegible" }),
    ).resolves.toMatchObject({ success: false, code: "UNAUTHORIZED" });

    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    await expect(
      correctSettlementProof({ invoiceId: 9, reason: "ilegible" }),
    ).resolves.toMatchObject({ success: false, code: "UNAUTHORIZED" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects an empty reason or missing idempotency key", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const emptyReason = await correctSettlementProof({
      invoiceId: 9,
      reason: " ",
      idempotencyKey,
    });
    expect(emptyReason).toMatchObject({ success: false, code: "VALIDATION" });

    const missingKey = await correctSettlementProof({
      invoiceId: 9,
      reason: "comprobante incorrecto",
    });
    expect(missingKey).toMatchObject({ success: false, code: "VALIDATION" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a paid accepted reservation without deleting payments", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = createTx({
      invoice: {
        id: 9,
        userId: 8,
        status: "paid",
        amount: 150,
        reservationId: 4,
      },
      reservation: {
        standId: 7,
        status: "accepted",
        festivalId: 10,
      },
      payments: [
        {
          id: 3,
          invoiceId: 9,
          amount: 150,
          date: new Date(),
          voucherUrl: "https://files.example.com/f/abc",
          fileKey: "uploadthing-key",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await correctSettlementProof({
      invoiceId: 9,
      reason: "comprobante incorrecto",
      idempotencyKey,
    });

    expect(result).toMatchObject({
      success: false,
      code: "INVOICE_NOT_PENDING",
    });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("does not correct proof state after the reservation was rejected", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = createTx({
      invoice: {
        id: 9,
        userId: 8,
        status: "verification_payment",
        amount: 150,
        reservationId: 4,
      },
      reservation: {
        standId: 7,
        status: "rejected",
        festivalId: 10,
      },
      existingSettlement: {
        id: 21,
        invoiceId: 9,
        status: "submitted",
        kind: "payment_proof",
        paymentId: 3,
      },
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await correctSettlementProof({
      invoiceId: 9,
      reason: "comprobante incorrecto",
      idempotencyKey,
    });

    expect(result).toMatchObject({
      success: false,
      code: "INVOICE_NOT_PENDING",
    });
    expect(tx.updates).toEqual([]);
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("rejects submitted settlements, moves reservation and invoice to pending, and keeps payments", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const tx = createTx({
      invoice: {
        id: 9,
        userId: 8,
        status: "verification_payment",
        amount: 150,
        reservationId: 4,
      },
      reservation: {
        standId: 7,
        status: "verification_payment",
        festivalId: 10,
      },
      existingSettlement: {
        id: 21,
        invoiceId: 9,
        status: "submitted",
        kind: "payment_proof",
        paymentId: 3,
      },
      payments: [
        {
          id: 3,
          invoiceId: 9,
          amount: 150,
          date: new Date(),
          voucherUrl: "https://files.example.com/f/abc",
          fileKey: "uploadthing-key",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await correctSettlementProof({
      invoiceId: 9,
      reason: "comprobante incorrecto",
      idempotencyKey,
    });

    expect(result.success).toBe(true);
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "rejected" }),
        expect.objectContaining({ fileKey: null }),
        expect.objectContaining({ status: "pending" }),
      ]),
    );
    expect(claimRequestMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        requestKey: `correctSettlementProof:9:${idempotencyKey}`,
        scope: expect.objectContaining({
          invoiceId: 9,
          idempotencyKey,
          submissionId: 21,
        }),
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: "settlement_rejected",
        idempotencyKey,
        payload: expect.objectContaining({ correction: "remove_proof" }),
      }),
    );
    expect(completeRequestMock).toHaveBeenCalledWith(
      tx,
      `correctSettlementProof:9:${idempotencyKey}`,
      { invoiceId: 9 },
    );
  });

  it("replays when the registry returns a completed correction", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    claimRequestMock.mockResolvedValue({ kind: "replayed" });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 150,
              reservationId: 4,
            },
            reservation: {
              standId: 7,
              status: "verification_payment",
              festivalId: 10,
            },
          }),
        ),
    );

    const first = await correctSettlementProof({
      invoiceId: 9,
      reason: "comprobante incorrecto",
      idempotencyKey,
    });
    const second = await correctSettlementProof({
      invoiceId: 9,
      reason: "comprobante incorrecto",
      idempotencyKey,
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(claimRequestMock).toHaveBeenCalledTimes(2);
    expect(claimRequestMock.mock.calls[0]?.[1]?.requestKey).toBe(
      `correctSettlementProof:9:${idempotencyKey}`,
    );
    expect(claimRequestMock.mock.calls[1]?.[1]?.requestKey).toBe(
      `correctSettlementProof:9:${idempotencyKey}`,
    );
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("allows a new correction when a different idempotency key is used", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    const otherKey = "22222222-2222-4222-8222-222222222222";
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback(
          createTx({
            invoice: {
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 150,
              reservationId: 4,
            },
            reservation: {
              standId: 7,
              status: "verification_payment",
              festivalId: 10,
            },
            existingSettlement: {
              id: 21,
              invoiceId: 9,
              status: "submitted",
              kind: "payment_proof",
              paymentId: 3,
            },
          }),
        ),
    );

    await correctSettlementProof({
      invoiceId: 9,
      reason: "comprobante incorrecto",
      idempotencyKey,
    });
    await correctSettlementProof({
      invoiceId: 9,
      reason: "otro motivo",
      idempotencyKey: otherKey,
    });

    expect(claimRequestMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        requestKey: `correctSettlementProof:9:${idempotencyKey}`,
      }),
    );
    expect(claimRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        requestKey: `correctSettlementProof:9:${otherKey}`,
      }),
    );
  });
});

function selectChain(rows: unknown[]) {
  const limited = Object.assign(Promise.resolve(rows), {
    limit: vi.fn(() => Promise.resolve(rows)),
  });
  const ordered = Object.assign(Promise.resolve(rows), {
    limit: vi.fn(() => Promise.resolve(rows)),
    orderBy: vi.fn(() => limited),
  });
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ordered),
      })),
    })),
  };
}

describe("findSubmittedSettlementInvoiceIdForReservation", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns the invoice id of a submitted settlement for that reservation", async () => {
    selectMock.mockReturnValue(selectChain([{ invoiceId: 20 }]));
    await expect(
      findSubmittedSettlementInvoiceIdForReservation(4),
    ).resolves.toBe(20);
  });

  it("returns null when the reservation has no submitted settlement", async () => {
    selectMock.mockReturnValue(selectChain([]));
    await expect(
      findSubmittedSettlementInvoiceIdForReservation(4),
    ).resolves.toBeNull();
  });
});
