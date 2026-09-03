import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const reviewCreditTopUpMock = vi.hoisted(() => vi.fn());
const adjustCreditAccountMock = vi.hoisted(() => vi.fn());
const resolveCreditDebtMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/app/lib/credits/service", () => ({
  reviewCreditTopUp: reviewCreditTopUpMock,
  adjustCreditAccount: adjustCreditAccountMock,
  resolveCreditDebt: resolveCreditDebtMock,
  CREDIT_DEBT_RESOLUTIONS: ["mark_paid", "waive"] as const,
}));

import {
  resolveCreditDebtAction,
  reviewCreditTopUpAction,
} from "@/app/lib/credits/actions";

describe("reviewCreditTopUpAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewCreditTopUpMock.mockResolvedValue({ ok: true, data: {} });
  });

  it.each([
    ["signed out", null],
    ["a participant", { id: 8, role: "user" }],
    ["a festival admin", { id: 3, role: "festival_admin" }],
  ])("refuses %s", async (_label, actor) => {
    currentProfileMock.mockResolvedValue(actor);

    const result = await reviewCreditTopUpAction({
      topUpId: 55,
      decision: "approved",
    });

    expect(result).toMatchObject({ success: false });
    expect(reviewCreditTopUpMock).not.toHaveBeenCalled();
  });

  it("requires a reason before rejecting", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });

    const result = await reviewCreditTopUpAction({
      topUpId: 55,
      decision: "rejected",
      rejectionReason: "   ",
    });

    expect(result).toMatchObject({ success: false });
    expect(reviewCreditTopUpMock).not.toHaveBeenCalled();
  });

  it("passes the reviewer through for a global admin", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });

    const result = await reviewCreditTopUpAction({
      topUpId: 55,
      decision: "rejected",
      rejectionReason: "El monto no coincide",
    });

    expect(reviewCreditTopUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topUpId: 55,
        decision: "rejected",
        rejectionReason: "El monto no coincide",
        reviewerUserId: 1,
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("reports a service failure instead of claiming success", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    reviewCreditTopUpMock.mockResolvedValue({
      ok: false,
      code: "TOP_UP_NOT_REVIEWABLE",
    });

    const result = await reviewCreditTopUpAction({
      topUpId: 55,
      decision: "approved",
    });

    expect(result).toMatchObject({ success: false });
  });
});

describe("resolveCreditDebtAction", () => {
  const key = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
    resolveCreditDebtMock.mockResolvedValue({ ok: true, data: {} });
  });

  it.each([
    ["signed out", null],
    ["a participant", { id: 8, role: "user" }],
    ["a festival admin", { id: 3, role: "festival_admin" }],
  ])("refuses %s", async (_label, actor) => {
    currentProfileMock.mockResolvedValue(actor);

    const result = await resolveCreditDebtAction({
      userId: 8,
      amount: 25,
      resolution: "waive",
      reason: "acordado",
      idempotencyKey: key,
    });

    expect(result).toMatchObject({ success: false });
    expect(resolveCreditDebtMock).not.toHaveBeenCalled();
  });

  it("requires a positive amount, a reason, and a known resolution", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });

    for (const input of [
      { amount: 0 },
      { amount: -5 },
      { reason: "  " },
      { resolution: "delete_everything" },
    ]) {
      const result = await resolveCreditDebtAction({
        userId: 8,
        amount: 25,
        resolution: "waive",
        reason: "acordado",
        idempotencyKey: key,
        ...input,
      });
      expect(result).toMatchObject({ success: false });
    }
    expect(resolveCreditDebtMock).not.toHaveBeenCalled();
  });

  it("records the reviewer and resolution kind for a global admin", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });

    const result = await resolveCreditDebtAction({
      userId: 8,
      amount: 25.5,
      resolution: "mark_paid",
      reason: "transferencia recibida por otro medio",
      idempotencyKey: key,
    });

    expect(resolveCreditDebtMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 8,
        amount: 25.5,
        resolution: "mark_paid",
        reason: "transferencia recibida por otro medio",
        reviewerUserId: 1,
        idempotencyKey: key,
      }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("explains a debt that another admin already cleared", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    resolveCreditDebtMock.mockResolvedValue({ ok: false, code: "NOT_IN_DEBT" });

    const result = await resolveCreditDebtAction({
      userId: 8,
      amount: 25,
      resolution: "waive",
      reason: "acordado",
      idempotencyKey: key,
    });

    expect(result).toMatchObject({
      success: false,
      message: "Esta cuenta ya no tiene saldo pendiente.",
    });
  });

  it("refuses to credit more than is owed", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    resolveCreditDebtMock.mockResolvedValue({
      ok: false,
      code: "AMOUNT_EXCEEDS_DEBT",
    });

    const result = await resolveCreditDebtAction({
      userId: 8,
      amount: 999,
      resolution: "waive",
      reason: "acordado",
      idempotencyKey: key,
    });

    expect(result).toMatchObject({
      success: false,
      message: "El monto supera el saldo pendiente de la cuenta.",
    });
  });
});
