import { describe, expect, it, vi } from "vitest";

const currentProfileMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const requireAdminOrFestivalAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  requireAdmin: requireAdminMock,
  requireAdminOrFestivalAdmin: requireAdminOrFestivalAdminMock,
}));

vi.mock("@/app/lib/reservations/policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/reservations/policy")>();
  return {
    ...actual,
    canMutateAdminReservations: (actor: { role?: string } | null) =>
      actor?.role === "admin",
  };
});

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/app/emails/terms-acceptance", () => ({
  default: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
    query: {
      users: { findFirst: vi.fn() },
      festivals: { findFirst: vi.fn() },
      userRequests: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import * as userRequestActions from "@/app/api/user_requests/actions";

describe("reservation mutation exposure", () => {
  it("does not expose the obsolete reservation mutation actions", () => {
    expect(userRequestActions).not.toHaveProperty("createReservation");
    expect(userRequestActions).not.toHaveProperty("updateReservation");
    expect(userRequestActions).not.toHaveProperty("updateReservationSimple");
    expect(userRequestActions).not.toHaveProperty("updateUserRequest");
  });
});
