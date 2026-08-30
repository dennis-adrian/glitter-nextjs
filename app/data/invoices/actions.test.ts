import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/lib/uploadthing/actions", () => ({
  enqueueStorageCleanupJob: vi.fn(),
  attemptStorageCleanupJob: vi.fn(),
}));

vi.mock("@/app/api/reservations/actions", () => ({
  confirmReservation: vi.fn(),
  sendReservationConfirmationEmails: vi.fn(),
}));

import { createPayment, confirmFreeInvoice } from "@/app/data/invoices/actions";
import {
  invoices,
  invoiceSettlementSubmissions,
} from "@/db/schema";

type LockedInvoice = {
  id: number;
  userId: number;
  status: "pending" | "verification_payment" | "paid" | "cancelled";
  amount: number | string;
  reservationId: number;
};

type CreatePaymentTxOptions = {
  invoice: LockedInvoice;
  reservation?: {
    standId: number;
    status: string;
    participants: unknown[];
  };
  payments?: Array<{
    id: number;
    invoiceId: number;
    amount: number | string;
    date: Date;
    voucherUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  existingSettlement?: { id: number } | null;
};

function sqlMentionsColumn(value: unknown, columnName: string): boolean {
  const seen = new Set<unknown>();
  const visit = (node: unknown): boolean => {
    if (node == null || seen.has(node)) return false;
    if (typeof node !== "object") return false;
    seen.add(node);
    if ((node as { name?: string }).name === columnName) return true;
    return Object.values(node as Record<string, unknown>).some(visit);
  };
  return visit(value);
}

function sqlPrimitiveValues(value: unknown): unknown[] {
  const seen = new Set<unknown>();
  const values: unknown[] = [];
  const visit = (node: unknown) => {
    if (node == null || seen.has(node)) return;
    if (typeof node !== "object") {
      values.push(node);
      return;
    }
    seen.add(node);
    for (const child of Object.values(node as Record<string, unknown>)) {
      visit(child);
    }
  };
  visit(value);
  return values;
}

function createPaymentTxMock(options: CreatePaymentTxOptions) {
  const reservation = options.reservation ?? {
    standId: 7,
    status: "pending",
    participants: [],
  };
  const invoicePayments = options.payments ?? [];

  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn((clause: unknown) => {
          if (table === invoiceSettlementSubmissions) {
            settlementWhereClauses.push(clause);
            return {
              limit: vi
                .fn()
                .mockResolvedValue(
                  options.existingSettlement
                    ? [options.existingSettlement]
                    : [],
                ),
            };
          }
          return {
            limit: vi.fn(() => ({
              for: vi.fn().mockResolvedValue(
                table === invoices ? [options.invoice] : [],
              ),
            })),
          };
        }),
      })),
    })),
    query: {
      standReservations: {
        findFirst: vi.fn().mockResolvedValue({
          id: options.invoice.reservationId,
          standId: reservation.standId,
          status: reservation.status,
          participants: reservation.participants,
        }),
      },
      payments: {
        findMany: vi.fn().mockResolvedValue(invoicePayments),
      },
    },
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        insertedValues.push(values);
        return {
          returning: vi.fn().mockResolvedValue([{ id: 99 }]),
        };
      },
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        updateSets.push(values);
        return {
          where: vi.fn().mockResolvedValue([]),
        };
      },
    })),
  };
}

const insertedValues: unknown[] = [];
const updateSets: unknown[] = [];
const settlementWhereClauses: unknown[] = [];

describe("createPayment authorization", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    insertedValues.length = 0;
    updateSets.length = 0;
    settlementWhereClauses.length = 0;
  });

  it("rejects unauthenticated callers", async () => {
    currentProfileMock.mockResolvedValue(null);
    const result = await createPayment({
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
        createPaymentTxMock({
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

    const result = await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
    });
    expect(result).toMatchObject({ success: false, code: "INVOICE_NOT_OWNED" });
  });

  it("ignores a caller-supplied amount and uses the canonical invoice amount", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback(
          createPaymentTxMock({
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

    await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
      amount: 1,
      standId: 99,
      reservationId: 123,
    });

    expect(insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invoiceId: 9,
          amount: 150,
          voucherUrl: "https://files.example.com/f/abc",
        }),
      ]),
    );
    expect(updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "verification_payment" }),
      ]),
    );
  });

  it("updates the newest payment row when multiple payments exist", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback(
          createPaymentTxMock({
            invoice: {
              id: 9,
              userId: 8,
              status: "pending",
              amount: 150,
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
              {
                id: 10,
                invoiceId: 9,
                amount: 150,
                date: new Date("2026-01-01T00:00:00.000Z"),
                voucherUrl: "https://files.example.com/old.pdf",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              },
            ],
          }),
        ),
    );

    await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/replacement.pdf",
    });

    expect(insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invoiceId: 9,
          voucherUrl: "https://files.example.com/replacement.pdf",
        }),
      ]),
    );
    expect(updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          voucherUrl: "https://files.example.com/replacement.pdf",
        }),
      ]),
    );
  });

  it("moves a pending invoice into review after a voucher is sent", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(async (callback: (value: unknown) => unknown) =>
      callback(
        createPaymentTxMock({
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

    const result = await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
    });

    expect(result.success).toBe(true);
    expect(updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "verification_payment" }),
      ]),
    );
  });

  it("replays only when the same invoice, uploader, and key already exist", async () => {
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback(
          createPaymentTxMock({
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

    const result = await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey,
    });

    expect(result).toMatchObject({
      success: true,
      message: "Ya enviamos un comprobante para esta factura. Esperá la revisión.",
    });
    expect(settlementWhereClauses).toHaveLength(1);
    expect(
      sqlMentionsColumn(settlementWhereClauses[0], "idempotency_key"),
    ).toBe(true);
    expect(sqlMentionsColumn(settlementWhereClauses[0], "invoice_id")).toBe(
      true,
    );
    expect(
      sqlMentionsColumn(settlementWhereClauses[0], "uploaded_by_user_id"),
    ).toBe(true);
    expect(sqlPrimitiveValues(settlementWhereClauses[0])).toEqual(
      expect.arrayContaining([idempotencyKey, 9, 8]),
    );
    expect(insertedValues).toHaveLength(0);
    expect(updateSets).toHaveLength(0);
  });

  it("stores a new submission when the same key is not scoped to this invoice and uploader", async () => {
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) =>
        callback(
          createPaymentTxMock({
            invoice: {
              id: 9,
              userId: 8,
              status: "pending",
              amount: 150,
              reservationId: 4,
            },
            existingSettlement: null,
          }),
        ),
    );

    const result = await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey,
    });

    expect(result.success).toBe(true);
    expect(result).not.toMatchObject({
      message: "Ya enviamos un comprobante para esta factura. Esperá la revisión.",
    });
    expect(settlementWhereClauses).toHaveLength(1);
    expect(
      sqlMentionsColumn(settlementWhereClauses[0], "idempotency_key"),
    ).toBe(true);
    expect(sqlMentionsColumn(settlementWhereClauses[0], "invoice_id")).toBe(
      true,
    );
    expect(
      sqlMentionsColumn(settlementWhereClauses[0], "uploaded_by_user_id"),
    ).toBe(true);
    expect(insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invoiceId: 9,
          uploadedByUserId: 8,
          idempotencyKey,
        }),
      ]),
    );
  });
});

describe("confirmFreeInvoice", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
  });

  it("rejects a second review request on an in-review invoice", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        query: {
          invoices: {
            findFirst: vi.fn().mockResolvedValue({
              id: 9,
              userId: 8,
              status: "verification_payment",
              amount: 0,
              reservationId: 4,
              reservation: { standId: 7, status: "verification_payment", participants: [] },
            }),
          },
        },
        update: vi.fn(),
      }),
    );

    const result = await confirmFreeInvoice({ invoiceId: 9 });
    expect(result).toMatchObject({
      success: false,
      code: "PAYMENT_ALREADY_SUBMITTED",
    });
  });
});
