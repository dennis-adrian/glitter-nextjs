import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildEmailCopy,
  buildInAppCopy,
  hasEmail,
  notificationCategory,
  notificationCreditDelta,
} from "@/app/lib/notifications/registry";

const gift = {
  campaignId: 3,
  name: "Ana",
  amount: 20,
  title: "Un regalo para agradecerte",
  message: "¡Gracias por ser parte de Glitter, Ana!",
};

describe("notification registry", () => {
  it("writes a gift's inbox item from its snapshot", () => {
    expect(buildInAppCopy("credit_gift_received", gift)).toEqual({
      title: "Recibiste 20 créditos de regalo",
      body: "¡Gracias por ser parte de Glitter, Ana!",
      actionPath: "/my_credits",
      actionLabel: "Ver mi billetera",
    });
    expect(notificationCreditDelta("credit_gift_received", gift)).toBe(20);
  });

  it("renders the same snapshot as the email, signed by the team", () => {
    const copy = buildEmailCopy("credit_gift_received", gift);
    expect(copy).toMatchObject({
      from: "Productora Glitter <creditos@productoraglitter.com>",
      subject: "Recibiste 20 créditos de regalo",
    });
    const html = renderToStaticMarkup(copy!.react);
    expect(html).toContain("¡Hola Ana!");
    expect(html).toContain("Productora Glitter");
    expect(html).toContain("/my_credits");
  });

  it("spells out the debt when a revocation leaves the balance negative", () => {
    const revoked = { ...gift, debtAmount: 15 };
    const copy = buildInAppCopy("credit_gift_revoked", revoked);
    expect(copy.title).toBe("Ajustamos tu saldo de créditos");
    expect(copy.body).toContain("saldo pendiente de 15 créditos");
    expect(notificationCreditDelta("credit_gift_revoked", revoked)).toBe(-20);

    const neutral = buildInAppCopy("credit_gift_revoked", {
      ...revoked,
      debtAmount: 0,
    });
    expect(neutral.body).not.toContain("pendiente");
  });

  it("keeps the admin summary in-app and in Administración", () => {
    expect(notificationCategory("credit_gift_completed")).toBe("admin");
    expect(hasEmail("credit_gift_completed")).toBe(false);
    expect(
      buildInAppCopy("credit_gift_completed", {
        campaignId: 3,
        title: "Regalo",
        granted: 35,
        skipped: 2,
        failed: 0,
        totalGranted: 700,
      }),
    ).toMatchObject({
      body: "35 acreditados, 2 omitidos. Total: Bs700.00.",
      actionPath: "/dashboard/credits/gifts/3",
    });
  });

  it("refuses a snapshot it cannot read instead of mailing nonsense", () => {
    expect(buildEmailCopy("credit_gift_received", { amount: "20" })).toBeNull();
    expect(buildEmailCopy("unknown_kind", gift)).toBeNull();
    expect(buildEmailCopy("credit_gift_completed", gift)).toBeNull();
  });
});
