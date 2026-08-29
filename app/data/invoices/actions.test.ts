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
};

function createPaymentTxMock(options: CreatePaymentTxOptions) {
  const reservation = options.reservation ?? {
    standId: 7,
    status: "pending",
    participants: [],
  };
  const invoicePayments = options.payments ?? [];

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([options.invoice]),
          })),
        })),
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
        return Promise.resolve();
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

describe("createPayment authorization", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    insertedValues.length = 0;
    updateSets.length = 0;
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

    expect(insertedValues).toEqual([
      {
        invoiceId: 9,
        amount: 150,
        date: expect.any(Date),
        voucherUrl: "https://files.example.com/f/abc",
      },
    ]);
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

    expect(insertedValues).toHaveLength(0);
    expect(updateSets.length).toBeGreaterThan(0);
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
