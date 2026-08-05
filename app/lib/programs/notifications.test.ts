import { render } from "@react-email/render";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));

import { sendAdminNewSignupEmail } from "@/app/lib/programs/notifications";

describe("sendAdminNewSignupEmail", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ data: { id: "email-1" } });
  });

  it("emails every admin and identifies the session", async () => {
    const result = await sendAdminNewSignupEmail({
      purchaseId: 42,
      attendeeName: "María Pérez",
      adminEmails: ["one@example.com", "two@example.com"],
      lines: [
        {
          sessionTitle: "Taller de ilustración",
          sessionType: "workshop",
          startsAt: new Date("2026-08-10T19:00:00.000Z"),
          endsAt: new Date("2026-08-10T21:00:00.000Z"),
          unitPrice: 120,
        },
      ],
      totalAmount: 120,
      promo: {
        code: "ARTISTA50",
        partnerName: "Artista invitada",
        discountPercent: 50,
        discountAmount: 120,
      },
    });

    expect(result).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["one@example.com", "two@example.com"],
        subject: "Nueva inscripción a Taller de ilustración",
      }),
      {
        idempotencyKey: "program-admin-new-signup-42",
      },
    );

    const payload = sendEmailMock.mock.calls[0]?.[0] as {
      react: React.ReactElement;
    };
    const html = await render(payload.react);
    expect(html).toContain("María Pérez");
    expect(html).toContain("Taller de ilustración");
    expect(html).toContain("ARTISTA50");
    expect(html).toContain("Artista invitada");
    expect(html).toContain("/dashboard/programs/purchases");
  });

  it("does not call the email provider when there are no admins", async () => {
    const result = await sendAdminNewSignupEmail({
      purchaseId: 42,
      attendeeName: "María Pérez",
      adminEmails: [],
      lines: [
        {
          sessionTitle: "Taller de ilustración",
          sessionType: "workshop",
          startsAt: new Date("2026-08-10T19:00:00.000Z"),
          endsAt: new Date("2026-08-10T21:00:00.000Z"),
          unitPrice: 120,
        },
      ],
      totalAmount: 120,
    });

    expect(result).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
