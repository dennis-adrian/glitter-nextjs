import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CreditTopUpRejectedTemplate from "@/app/emails/credit-top-up-rejected";

const profile = {
  id: 1,
  displayName: "Yoko_katt",
  firstName: null,
  lastName: null,
  email: "participant@example.com",
};

function render(overrides: { debtAmount: number }) {
  return renderToStaticMarkup(
    CreditTopUpRejectedTemplate({
      profile,
      amount: 90,
      reason: "El comprobante no coincide con ninguna transferencia",
      ...overrides,
    } as Parameters<typeof CreditTopUpRejectedTemplate>[0]),
  );
}

describe("CreditTopUpRejectedTemplate", () => {
  it("gives the reason the admin recorded", () => {
    const html = render({ debtAmount: 0 });

    expect(html).toContain(
      "El comprobante no coincide con ninguna transferencia",
    );
  });

  /**
   * The whole reason this email exists. Credits are spendable before review,
   * so a rejection can land after they already paid for a reservation — and
   * nothing is undone by it (PRD §4.3). Saying only "you owe money" would
   * leave someone assuming their stand was cancelled too.
   */
  it("names the debt and says what it bought still stands", () => {
    const html = render({ debtAmount: 90 });

    expect(html).toContain("saldo pendiente");
    expect(html).toContain("90 créditos");
    expect(html).toContain("sigue en pie");
  });

  it("says nothing about a debt when the credits were untouched", () => {
    const html = render({ debtAmount: 0 });

    expect(html).not.toContain("saldo pendiente");
    expect(html).toContain("no queda nada pendiente");
  });

  /** Never `multa` or `penalización`: this is a purchase that did not clear. */
  it("keeps penalty language out of it", () => {
    for (const debtAmount of [0, 90]) {
      const html = render({ debtAmount }).toLowerCase();
      expect(html).not.toContain("multa");
      expect(html).not.toContain("penalizaci");
      expect(html).not.toContain("sanci");
    }
  });
});
