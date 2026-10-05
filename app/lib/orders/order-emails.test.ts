// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sends the order confirmation pair through the real `sendEmail` and Resend
 * SDK with the HTTP reply mocked per recipient, so a rejection of one email
 * shows whether the other still goes out.
 */

const { fetchAdminUsers } = vi.hoisted(() => ({ fetchAdminUsers: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/users/queries", () => ({ fetchAdminUsers }));

import {
  sendGuestOrderEmails,
  sendOrderEmails,
} from "@/app/lib/orders/order-emails";
import { EmailSendError } from "@/app/vendors/resend-result";

const order = {
  orderId: 31,
  customerEmail: "cliente@example.com",
  customerName: "Cliente",
  products: [
    {
      id: 1,
      name: "Póster",
      quantity: 1,
      price: 50,
      status: "available" as const,
      availableDate: null,
    },
  ],
  total: 50,
};

const fetchMock = vi.fn();

function resendReply(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Rejects the send addressed to `email`; accepts every other one. */
function rejectSendTo(email: string) {
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const { to } = JSON.parse(String(init.body)) as { to: string[] };
    return to.includes(email)
      ? resendReply(
          { name: "validation_error", statusCode: 422, message: "Invalid." },
          422,
        )
      : resendReply({ id: "email-1" }, 200);
  });
}

function recipients() {
  return fetchMock.mock.calls.map(
    ([, init]) => (JSON.parse(String(init.body)) as { to: string[] }).to,
  );
}

describe.each([
  ["sendOrderEmails", () => sendOrderEmails(order)],
  [
    "sendGuestOrderEmails",
    () => sendGuestOrderEmails({ ...order, guestOrderToken: "token" }),
  ],
] as const)("%s", (_name, send) => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchAdminUsers.mockResolvedValue([{ email: "admin@example.com" }]);
    // The SDK logs every API error outside production, and so does the sender.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("still notifies admins when the customer's confirmation is rejected", async () => {
    rejectSendTo(order.customerEmail);

    await expect(send()).resolves.toBeUndefined();

    expect(recipients()).toEqual([
      [order.customerEmail],
      ["admin@example.com"],
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("order confirmation email"),
      expect.objectContaining({
        orderId: order.orderId,
        error: expect.any(EmailSendError),
      }),
    );
  });

  it("reports a rejected admin notice to the caller", async () => {
    rejectSendTo("admin@example.com");

    await expect(send()).rejects.toBeInstanceOf(EmailSendError);
  });
});
