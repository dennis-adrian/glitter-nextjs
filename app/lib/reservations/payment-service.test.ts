import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const enqueueNotificationsMock = vi.hoisted(() => vi.fn());
const scheduleJobsMock = vi.hoisted(() => vi.fn());
const insertEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    query: {
      invoices: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/lib/reservations/locks", () => ({
  lockFestivalRow: vi.fn(),
  lockParticipants: vi.fn(),
  lockStandRows: vi.fn(),
}));

vi.mock("@/app/lib/reservations/notification-outbox", () => ({
  enqueueAdminAndOwnerNotifications: enqueueNotificationsMock,
  scheduleReservationNotificationJobs: scheduleJobsMock,
}));

vi.mock("@/app/lib/reservations/events", () => ({
  insertStandReservationEvent: insertEventMock,
}));

vi.mock("@/app/lib/reservations/admin-service", () => ({
  applyReservationCancellation: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/lib/uploadthing/actions", () => ({
  enqueueStorageCleanupJob: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  rejectInvoiceSettlement,
  submitPaymentProof,
  submitZeroValueInvoiceForReview,
} from "@/app/lib/reservations/payment-service";
import {
  invoiceSettlementSubmissions,
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
  status?: string;
  kind?: string;
  paymentId?: number | null;
};

function createTx(options: {
  invoice: LockedInvoice;
  reservation?: { id?: number; standId: number; status: string; festivalId?: number };
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

  const tx = {
    inserted,
    updates,
    settlementWhere,
    select: vi.fn(() => ({
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
                    status: submission.status ?? "submitted",
                    kind: submission.kind ?? "payment_proof",
                    paymentId: submission.paymentId ?? null,
                  },
                ]
              : [];
            return Object.assign(Promise.resolve(rows), {
              limit: vi.fn(() =>
                Object.assign(Promise.resolve(rows), {
                  for: vi.fn().mockResolvedValue(rows),
                }),
              ),
            });
          }
          if (table === payments) {
            return {
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue(invoicePayments.slice(0, 1)),
              })),
            };
          }
          if (table === users) {
            return {
              limit: vi
                .fn()
                .mockResolvedValue([{ email: options.ownerEmail ?? "ada@example.com" }]),
            };
          }
          if (table === reservationParticipants) {
            return Promise.resolve([]);
          }
          return {
            limit: vi.fn(() => ({
              for: vi.fn().mockResolvedValue(
                table === invoices
                  ? [options.invoice]
                  : table === standReservations
                    ? [reservation]
                    : [],
              ),
            })),
          };
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        inserted.push(values);
        return {
          returning: vi.fn().mockResolvedValue([{ id: 99 }]),
        };
      },
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        updates.push(values);
        return {
          where: vi.fn().mockResolvedValue([]),
        };
      },
    })),
  };

  return tx;
}

describe("submitPaymentProof", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueNotificationsMock.mockReset();
    scheduleJobsMock.mockReset();
    insertEventMock.mockReset();
    enqueueNotificationsMock.mockResolvedValue([1]);
  });

  it("rejects unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    const result = await submitPaymentProof({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
    });
    expect(result).toMatchObject({ success: false, code: "UNAUTHENTICATED" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a caller who does not own the invoice", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "user" });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
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
      voucherUrl: "https://files.example.com/f/abc",
    });
    expect(result).toMatchObject({ success: false, code: "INVOICE_NOT_OWNED" });
  });

  it("ignores a caller-supplied amount and uses the canonical invoice amount", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    let tx: ReturnType<typeof createTx> | undefined;
    transactionMock.mockImplementation(async (callback: (value: unknown) => unknown) => {
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
    });

    await submitPaymentProof({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
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
    transactionMock.mockImplementation(async (callback: (value: unknown) => unknown) => {
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
    });

    await submitPaymentProof({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/replacement.pdf",
    });

    expect(tx?.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          voucherUrl: "https://files.example.com/replacement.pdf",
        }),
      ]),
    );
  });

  it("replays when the same invoice, uploader, and key already exist", async () => {
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(async (callback: (value: unknown) => unknown) =>
      callback(
        createTx({
          invoice: {
            id: 9,
            userId: 8,
            status: "pending",
            amount: 150,
            reservationId: 4,
          },
          existingSettlement: { id: 21 },
        }),
      ),
    );

    const result = await submitPaymentProof({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey,
    });

    expect(result).toMatchObject({
      success: true,
      message: "Ya enviamos un comprobante para esta factura. Esperá la revisión.",
    });
  });
});

describe("submitZeroValueInvoiceForReview", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueNotificationsMock.mockResolvedValue([]);
  });

  it("rejects a second review request on an in-review invoice", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
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

    const result = await submitZeroValueInvoiceForReview({ invoiceId: 9 });
    expect(result).toMatchObject({
      success: false,
      code: "PAYMENT_ALREADY_SUBMITTED",
    });
  });
});

describe("rejectInvoiceSettlement", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    enqueueNotificationsMock.mockReset();
    scheduleJobsMock.mockReset();
    insertEventMock.mockReset();
    enqueueNotificationsMock.mockResolvedValue([1]);
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
  });

  it("rejects keep_amount correction for zero-value entitlement submissions", async () => {
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
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
    expect(scheduleJobsMock).not.toHaveBeenCalled();
  });
});
