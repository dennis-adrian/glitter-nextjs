import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PaymentConfirmationForUserEmailTemplate from "@/app/emails/payment-confirmation-for-user";

const invoice = {
  amount: 50,
  user: { displayName: "Ana Ilustra" },
  reservation: {
    festival: { name: "Glitter ¡Feliz Cumple!" },
    stand: { label: "B", standNumber: 48 },
    members: [
      { position: 0, releasedAt: null, stand: { label: "B", standNumber: 48 } },
    ],
  },
} as unknown as Parameters<
  typeof PaymentConfirmationForUserEmailTemplate
>[0]["invoice"];

describe("PaymentConfirmationForUserEmailTemplate", () => {
  it("ends each sentence with a period", () => {
    const html = renderToStaticMarkup(
      PaymentConfirmationForUserEmailTemplate({ invoice }),
    );

    expect(html).toContain("Glitter ¡Feliz Cumple!</strong>.");
    expect(html).toContain("haciendo clic en el botón.");
  });
});
