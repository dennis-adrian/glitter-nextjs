import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const profileMock = vi.hoisted(() => vi.fn());
const createPaymentMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: profileMock,
}));

vi.mock("@/app/data/invoices/actions", () => ({
  createPayment: createPaymentMock,
}));

vi.mock("@/app/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(),
  POSTHOG_SHUTDOWN_TIMEOUT_MS: 1000,
}));

import { POST } from "@/app/api/payments/route";

describe("POST /api/payments", () => {
  beforeEach(() => {
    authMock.mockReset();
    profileMock.mockReset();
    createPaymentMock.mockReset();
    authMock.mockResolvedValue({ userId: "clerk_1" });
    profileMock.mockResolvedValue({ id: 8, role: "user" });
  });

  it("returns 400 for invalid JSON bodies", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments", {
        method: "POST",
        body: "{",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "Invalid payment data",
    });
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("returns 400 for null JSON bodies", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments", {
        method: "POST",
        body: "null",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    expect(createPaymentMock).not.toHaveBeenCalled();
  });
});
