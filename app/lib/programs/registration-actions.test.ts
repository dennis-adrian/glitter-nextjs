// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeFreeRegistrationRateLimit: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  getBuyerEligibility: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  featureFlagGuard: async () => null,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: mocks.getCurrentUserProfile,
}));
vi.mock("@/app/lib/programs/free-registration-rate-limit", () => ({
  consumeFreeRegistrationRateLimit: mocks.consumeFreeRegistrationRateLimit,
}));
vi.mock("@/app/lib/programs/eligibility-queries", () => ({
  getBuyerEligibility: mocks.getBuyerEligibility,
}));
vi.mock("@/app/lib/programs/notifications", () => ({
  sendFreeRegistrationEmail: vi.fn(),
}));

import {
  registerForFreeSession,
  type FreeRegistrationInput,
} from "@/app/lib/programs/registration-actions";

const guestInput: FreeRegistrationInput = {
  occurrenceId: 7,
  guestName: "Invitada",
  guestEmail: "invitada@example.test",
  guestPhone: "+59171234567",
  guestGender: "female",
  guestBirthdate: "1990-05-01",
  acceptsNoRefundPolicy: true,
};

const signedInProfile = {
  id: 42,
  email: "participante@example.test",
  displayName: "Participante",
  firstName: null,
  lastName: null,
};

describe("registerForFreeSession rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserProfile.mockResolvedValue(null);
    mocks.consumeFreeRegistrationRateLimit.mockResolvedValue(false);
  });

  it("refuses a guest over the limit before reading eligibility or taking a seat", async () => {
    const result = await registerForFreeSession(guestInput);

    expect(result).toEqual({
      success: false,
      message: "Demasiados intentos seguidos. Esperá un rato e intentá de nuevo.",
    });
    expect(mocks.consumeFreeRegistrationRateLimit).toHaveBeenCalledWith(null);
    expect(mocks.getBuyerEligibility).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("limits a signed-in attendee by their account", async () => {
    mocks.getCurrentUserProfile.mockResolvedValue(signedInProfile);

    await registerForFreeSession({
      occurrenceId: 7,
      acceptsNoRefundPolicy: true,
    });

    expect(mocks.consumeFreeRegistrationRateLimit).toHaveBeenCalledWith(42);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not spend the allowance on a request it rejects as incomplete", async () => {
    await registerForFreeSession({ ...guestInput, guestPhone: undefined });

    expect(mocks.consumeFreeRegistrationRateLimit).not.toHaveBeenCalled();
  });
});
