import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CreditTopUpApprovedTemplate from "@/app/emails/credit-top-up-approved";

const profile = {
  id: 1,
  displayName: "Yoko_katt",
  firstName: null,
  lastName: null,
  email: "participant@example.com",
};

function render() {
  return renderToStaticMarkup(
    CreditTopUpApprovedTemplate({
      profile,
      amount: 90,
    } as Parameters<typeof CreditTopUpApprovedTemplate>[0]),
  );
}

describe("CreditTopUpApprovedTemplate", () => {
  it("confirms the purchase and names its amount", () => {
    const html = render();

    expect(html).toContain("Yoko_katt");
    expect(html).toContain("90 créditos");
    expect(html).toContain("quedó confirmada");
    expect(html).toContain("/my_credits");
  });

  /**
   * Credits are spendable from the upload, so the approval adds nothing. The
   * copy must not read as though the credits only just arrived.
   */
  it("says the credits were already in the wallet", () => {
    expect(render()).toContain("ya estaban disponibles");
  });
});
