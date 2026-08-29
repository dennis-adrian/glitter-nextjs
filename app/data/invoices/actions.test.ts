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

describe("createPayment authorization", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
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
      callback({
        query: {
          invoices: {
            findFirst: vi.fn().mockResolvedValue({
              id: 9,
              userId: 8,
              status: "pending",
              amount: 150,
              reservationId: 4,
              reservation: { standId: 7, status: "pending", participants: [] },
              payments: [],
            }),
          },
        },
        insert: vi.fn(),
        update: vi.fn(),
      }),
    );

    const result = await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
    });
    expect(result).toMatchObject({ success: false, code: "INVOICE_NOT_OWNED" });
  });

  it("ignores a caller-supplied amount and uses the canonical invoice amount", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    const inserted: unknown[] = [];
    const invoiceSets: unknown[] = [];
    const tx = {
      query: {
        invoices: {
          findFirst: vi.fn().mockResolvedValue({
            id: 9,
            userId: 8,
            status: "pending",
            amount: 150,
            reservationId: 4,
            reservation: { standId: 7, status: "pending", participants: [] },
            payments: [],
          }),
        },
      },
      insert: vi.fn(() => ({
        values: (values: unknown) => {
          inserted.push(values);
          return Promise.resolve();
        },
      })),
      update: vi.fn(() => ({
        set: (values: unknown) => {
          invoiceSets.push(values);
          return {
            where: vi.fn().mockResolvedValue([]),
          };
        },
      })),
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
      amount: 1,
      standId: 99,
      reservationId: 123,
    });

    expect(inserted).toEqual([
      {
        invoiceId: 9,
        amount: 150,
        date: expect.any(Date),
        voucherUrl: "https://files.example.com/f/abc",
      },
    ]);
    expect(invoiceSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "verification_payment" }),
      ]),
    );
  });

  it("moves a pending invoice into review after a voucher is sent", async () => {
    currentProfileMock.mockResolvedValue({ id: 8, role: "user" });
    const invoiceSets: unknown[] = [];
    transactionMock.mockImplementation(async (callback: (value: unknown) => unknown) =>
      callback({
        query: {
          invoices: {
            findFirst: vi.fn().mockResolvedValue({
              id: 9,
              userId: 8,
              status: "pending",
              amount: 150,
              reservationId: 4,
              reservation: { standId: 7, status: "pending", participants: [] },
              payments: [],
            }),
          },
        },
        insert: vi.fn(() => ({
          values: () => Promise.resolve(),
        })),
        update: vi.fn(() => ({
          set: (values: unknown) => {
            invoiceSets.push(values);
            return { where: vi.fn().mockResolvedValue([]) };
          },
        })),
      }),
    );

    const result = await createPayment({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
    });

    expect(result.success).toBe(true);
    expect(invoiceSets).toEqual(
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
