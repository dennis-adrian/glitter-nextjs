// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ReadOnly extends Error {
    readonly code = "IMPERSONATION_READ_ONLY";
  }
  return {
    ReadOnly,
    viewing: { value: false },
    refuseDuringView: vi.fn(),
    requireAdmin: vi.fn(),
    resend: vi.fn(),
    schedule: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/db/write-guard", () => ({
  refuseDuringView: mocks.refuseDuringView,
  isImpersonationReadOnlyError: (error: unknown) =>
    (error as { code?: string })?.code === "IMPERSONATION_READ_ONLY",
}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/app/lib/notifications/admin-resend", () => ({
  resendFailedNotificationEmail: mocks.resend,
}));
vi.mock("@/app/lib/notifications/deliveries", () => ({
  scheduleNotificationDeliveries: mocks.schedule,
}));

import { resendFailedNotificationEmailAction } from "@/app/lib/notifications/admin-resend-actions";
import { NOTIFICATION_RESEND_REFUSALS } from "@/app/lib/notifications/admin-resend-definitions";

const ADMIN = { id: 42, role: "admin" };

beforeEach(() => {
  mocks.viewing.value = false;
  mocks.refuseDuringView.mockImplementation(async () => {
    if (mocks.viewing.value) throw new mocks.ReadOnly("solo lectura");
  });
  mocks.requireAdmin.mockResolvedValue(ADMIN);
  mocks.resend.mockResolvedValue({ ok: true, deliveryId: 900 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resendFailedNotificationEmailAction", () => {
  it("refuses during a view before reading who asks or writing anything", async () => {
    mocks.viewing.value = true;

    expect(await resendFailedNotificationEmailAction({ deliveryId: 7 })).toEqual(
      { success: false, message: "solo lectura" },
    );
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("refuses anyone but an admin", async () => {
    mocks.requireAdmin.mockResolvedValue(null);

    expect(await resendFailedNotificationEmailAction({ deliveryId: 7 })).toEqual(
      { success: false, message: "No autorizado." },
    );
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it.each([
    ["a string id", { deliveryId: "7" }],
    ["a negative id", { deliveryId: -1 }],
    ["an id past the serial range", { deliveryId: 2_147_483_648 }],
    ["nothing", undefined],
  ])("refuses %s without touching the ledger", async (_label, input) => {
    expect(await resendFailedNotificationEmailAction(input)).toEqual({
      success: false,
      message: NOTIFICATION_RESEND_REFUSALS.NOT_FOUND,
    });
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("writes the resend as the admin, then schedules it and refreshes the log", async () => {
    const result = await resendFailedNotificationEmailAction({
      deliveryId: 7,
    });

    expect(result.success).toBe(true);
    expect(mocks.resend).toHaveBeenCalledWith({ deliveryId: 7, by: 42 });
    expect(mocks.schedule).toHaveBeenCalledWith([900]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/notifications",
    );
  });

  it.each(
    Object.entries(NOTIFICATION_RESEND_REFUSALS) as [
      keyof typeof NOTIFICATION_RESEND_REFUSALS,
      string,
    ][],
  )("answers the refusal %s in words and sends nothing", async (code, text) => {
    mocks.resend.mockResolvedValue({ ok: false, code });

    expect(await resendFailedNotificationEmailAction({ deliveryId: 7 })).toEqual(
      { success: false, message: text },
    );
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("answers a failure without its message, which can carry the address", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.resend.mockRejectedValue(new Error("lola@example.test broke"));

    expect(await resendFailedNotificationEmailAction({ deliveryId: 7 })).toEqual(
      {
        success: false,
        message: "No pudimos reenviar el correo. Probá de nuevo.",
      },
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain("lola@example.test");
    expect(mocks.schedule).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
