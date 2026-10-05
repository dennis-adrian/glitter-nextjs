import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const submitZeroValueMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/app/lib/reservations/payment-service", () => ({
  submitZeroValueInvoiceForReview: submitZeroValueMock,
}));

const invoiceFindFirstMock = vi.hoisted(() => vi.fn());
const reservationFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({}) }) }),
    query: {
      invoices: { findFirst: invoiceFindFirstMock },
      standReservations: { findMany: reservationFindManyMock },
    },
  },
}));

import {
  confirmFreeInvoice,
  fetchInvoice,
  fetchReservationsWithInvoicesByProfileAndFestival,
} from "@/app/data/invoices/actions";
import * as invoiceActions from "@/app/data/invoices/actions";

describe("invoice action delegation", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    submitZeroValueMock.mockReset();
  });

  it("does not export legacy payment mutation helpers", () => {
    expect(invoiceActions).not.toHaveProperty("createPayment");
    expect(invoiceActions).not.toHaveProperty("updateInvoiceStatus");
    expect(invoiceActions).not.toHaveProperty("adminRemovePaymentVoucher");
    expect(invoiceActions).not.toHaveProperty("fetchLatestInvoiceByProfileId");
  });

  it("confirmFreeInvoice forwards to zero-value review", async () => {
    submitZeroValueMock.mockResolvedValue({
      success: true,
      data: { submissionId: 4 },
      message: "ok",
    });
    await confirmFreeInvoice({ invoiceId: 9 });
    expect(submitZeroValueMock).toHaveBeenCalledWith({ invoiceId: 9 });
  });
});

// A reservation partner can open the owner's cobro and the reverse, so these
// reads must not carry anyone's full user row (email, phone, birthdate...).
describe("invoice reads shared between reservation partners", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    invoiceFindFirstMock.mockReset();
    reservationFindManyMock.mockReset();
  });

  it("fetchInvoice loads participants as ids and no user rows", async () => {
    currentProfileMock.mockResolvedValue({ id: 5, role: "user" });
    invoiceFindFirstMock.mockResolvedValue({
      id: 9,
      userId: 7,
      reservation: { participants: [{ userId: 7 }, { userId: 5 }] },
    });

    expect(await fetchInvoice(9)).toMatchObject({ id: 9 });

    const query = invoiceFindFirstMock.mock.calls[0][0];
    expect(query.with).not.toHaveProperty("user");
    expect(query.with.reservation.with.participants).toEqual({
      columns: { userId: true },
    });
  });

  it("lists a partner's cobros with only the owner's display fields", async () => {
    currentProfileMock.mockResolvedValue({ id: 5, role: "user" });
    reservationFindManyMock.mockResolvedValue([]);

    await fetchReservationsWithInvoicesByProfileAndFestival(5, 3);

    const query = reservationFindManyMock.mock.calls[0][0];
    expect(query.with.invoices.with.user).toEqual({
      columns: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
      },
    });
  });
});
