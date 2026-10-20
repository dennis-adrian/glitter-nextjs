import { describe, expect, it } from "vitest";

import { fullTableDowngradeDisabledReason } from "@/app/components/reservations/full-table-downgrade-options";

describe("fullTableDowngradeDisabledReason", () => {
  it("lets a global admin reduce a table with no money on its cobro", () => {
    expect(
      fullTableDowngradeDisabledReason({
        isGlobalAdmin: true,
        moneyBlocker: null,
      }),
    ).toBeNull();
  });

  /**
   * The rights come first: a festival admin is refused before any money is
   * looked at, and the page does not even run the money check for them.
   */
  it("restricts a festival admin whatever the cobro holds", () => {
    expect(
      fullTableDowngradeDisabledReason({
        isGlobalAdmin: false,
        moneyBlocker: "credits",
      }),
    ).toBe("Solo un administrador general puede reducirla.");
  });

  it.each([
    [
      "proof_under_review",
      "No se puede reducir mientras haya un comprobante o una solicitud en revisión.",
    ],
    ["credits", "No se puede reducir: el cobro tiene créditos aplicados."],
    [
      "approved_payment",
      "No se puede reducir: el cobro tiene un pago aprobado.",
    ],
    [
      "legacy_payment",
      "No se puede reducir: el cobro tiene un pago registrado.",
    ],
  ] as const)("names %s as the reason", (moneyBlocker, reason) => {
    expect(
      fullTableDowngradeDisabledReason({ isGlobalAdmin: true, moneyBlocker }),
    ).toBe(reason);
  });
});
