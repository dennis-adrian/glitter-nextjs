import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CreditGiftReceivedEmail from "@/app/emails/credit-gift-received";
import CreditGiftRevokedEmail from "@/app/emails/credit-gift-revoked";

describe("credit gift emails", () => {
  it("greets without a gap when the participant has no name", () => {
    const html = renderToStaticMarkup(
      CreditGiftReceivedEmail({
        ...CreditGiftReceivedEmail.PreviewProps,
        name: null,
      }),
    );
    expect(html).toContain("¡Hola!");
    expect(html).not.toContain("¡Hola !");
  });

  it("says the credits are already there, with nothing to claim", () => {
    const html = renderToStaticMarkup(
      CreditGiftReceivedEmail(CreditGiftReceivedEmail.PreviewProps),
    );
    expect(html).toContain("Recibiste <strong>20 créditos</strong> de regalo.");
    expect(html).toContain("Ya están en tu billetera");
    expect(html).not.toMatch(/reclam/i);
  });

  it("tells a revoked recipient what they owe only when they owe it", () => {
    const owes = renderToStaticMarkup(
      CreditGiftRevokedEmail({
        ...CreditGiftRevokedEmail.PreviewProps,
        debtAmount: 15,
      }),
    );
    expect(owes).toContain("saldo pendiente");
    expect(owes).toContain("15 créditos");

    const clear = renderToStaticMarkup(
      CreditGiftRevokedEmail(CreditGiftRevokedEmail.PreviewProps),
    );
    expect(clear).not.toContain("saldo pendiente");
  });
});
