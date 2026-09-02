import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const reviewCreditTopUpMock = vi.hoisted(() => vi.fn());
const adjustCreditAccountMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/app/lib/credits/service", () => ({
  reviewCreditTopUp: reviewCreditTopUpMock,
  adjustCreditAccount: adjustCreditAccountMock,
}));

import { reviewCreditTopUpAction } from "@/app/lib/credits/actions";

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
