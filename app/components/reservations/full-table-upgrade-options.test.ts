import { describe, expect, it } from "vitest";

import {
  describeFullTableUpgrade,
  describeFullTableUpgradeCard,
  describeFullTableUpgradeCharge,
  describeFullTableUpgradeLatePartner,
  describeFullTableUpgradeSettlement,
  describeFullTableUpgradeWriteOff,
  fullTableUpgradeDisabledReason,
} from "@/app/components/reservations/full-table-upgrade-options";
import {
  fullTableUpgradeExpectation,
  planFullTableUpgrade,
  type FullTableUpgradeInvoice,
  type FullTableUpgradePlan,
} from "@/app/lib/reservations/full-table-upgrade";
import type { FullTableUpgradePreview } from "@/app/lib/reservations/full-table-upgrade-queries";

/**
 * Plans are built with the real planner rather than written by hand, so these
 * tests describe the numbers the service is actually going to apply.
 */
function plan(
  input: {
    tablePrice?: number;
    priceAmountSnapshot?: number | null;
    liveInvoice?: FullTableUpgradeInvoice | null;
    coveredAmount?: number;
    latePartnerPrepaid?: number;
    reservationStatus?: string;
    zeroValueEntitlementApproved?: boolean;
  } = {},
): FullTableUpgradePlan {
  return planFullTableUpgrade({
    tablePrice: input.tablePrice ?? 450,
    priceAmountSnapshot:
      input.priceAmountSnapshot === undefined ? 300 : input.priceAmountSnapshot,
    liveInvoice:
      input.liveInvoice === undefined
        ? { originalAmount: 300, discountAmount: 0, amount: 300 }
        : input.liveInvoice,
    coveredAmount: input.coveredAmount ?? 0,
    latePartnerPrepaid: input.latePartnerPrepaid ?? 0,
    reservationStatus: input.reservationStatus ?? "pending",
    zeroValueEntitlementApproved: input.zeroValueEntitlementApproved ?? false,
  });
}

function preview(
  overrides: Partial<FullTableUpgradePreview> = {},
): FullTableUpgradePreview {
  const base = plan();
  return {
    reservationStatus: "pending",
    keptStand: { id: 1, label: "A1" },
    inFullTableGroup: true,
    groupIssue: null,
    companion: { id: 2, label: "A2" },
    companionState: "free",
    tablePrice: 450,
    proofUnderReview: false,
    hasInvoice: true,
    hasOwner: true,
    hasTender: false,
    plan: base,
    expected: fullTableUpgradeExpectation(base),
    ...overrides,
  };
}

function reason(
  overrides: Partial<FullTableUpgradePreview> = {},
  input: {
    isGlobalAdmin?: boolean;
    reservationStatus?: string;
    liveMemberCount?: number;
  } = {},
) {
  return fullTableUpgradeDisabledReason({
    isGlobalAdmin: input.isGlobalAdmin ?? true,
    reservationStatus: input.reservationStatus ?? "pending",
    liveMemberCount: input.liveMemberCount ?? 1,
    preview: preview(overrides),
  });
}

describe("full table upgrade disabled reason", () => {
  it("allows a free, priced companion", () => {
    expect(reason()).toBeNull();
  });

  /**
   * A festival admin reaches the page but has no right to this command. The
   * reason comes first so it is never masked by something about the table.
   */
  it("restricts it to a global admin before anything else", () => {
    expect(
      reason({ companionState: "occupied" }, { isGlobalAdmin: false }),
    ).toBe("Solo un administrador general puede ampliar una reserva.");
  });

  it.each(["rejected", "cancelled", "released"])(
    "refuses a %s reservation",
    (status) => {
      expect(reason({}, { reservationStatus: status })).toBe(
        "Esta reserva ya no ocupa un espacio.",
      );
    },
  );

  it.each(["pending", "verification_payment", "accepted"])(
    "allows a %s reservation",
    (status) => {
      expect(reason({}, { reservationStatus: status })).toBeNull();
    },
  );

  it("refuses a reservation that already holds both halves", () => {
    expect(reason({}, { liveMemberCount: 2 })).toBe(
      "Esta reserva ya ocupa la mesa completa.",
    );
  });

  it("does not call a reservation with no stand a full table", () => {
    expect(reason({}, { liveMemberCount: 0 })).toBe(
      "Esta reserva ya no ocupa un espacio.",
    );
  });

  it("refuses a stand outside any full table", () => {
    expect(
      reason({
        inFullTableGroup: false,
        companion: null,
        companionState: null,
        tablePrice: null,
        plan: null,
        expected: null,
      }),
    ).toContain("no forma parte de una mesa completa");
  });

  it("names a malformed table", () => {
    expect(
      reason({
        groupIssue: "malformed",
        companion: null,
        companionState: null,
        plan: null,
        expected: null,
      }),
    ).toBe("La mesa no tiene exactamente dos espacios.");
  });

  it("names an unpriced table", () => {
    expect(
      reason({
        groupIssue: "unpriced",
        tablePrice: null,
        plan: null,
        expected: null,
      }),
    ).toBe("La mesa no tiene precio configurado.");
  });

  it("tells an occupied companion from a held one", () => {
    expect(reason({ companionState: "occupied" })).toBe(
      "La otra mitad ya está ocupada por otra reserva.",
    );
    expect(reason({ companionState: "held" })).toBe(
      "Alguien está reservando la otra mitad en este momento.",
    );
  });

  it("blocks a price change while a submission is under review", () => {
    expect(reason({ proofUnderReview: true })).toContain("en revisión");
  });

  /**
   * The service only refuses a proof under review when the price moves: the
   * reviewer's total is untouched otherwise.
   */
  it("lets an upgrade that keeps the price through a submission under review", () => {
    const samePrice = plan({
      priceAmountSnapshot: 450,
      liveInvoice: { originalAmount: 450, discountAmount: 0, amount: 450 },
    });
    expect(
      reason({
        proofUnderReview: true,
        plan: samePrice,
        expected: fullTableUpgradeExpectation(samePrice),
      }),
    ).toBeNull();
  });

  it("blocks a surplus with no owner to hand the credits to", () => {
    const overpaid = plan({
      tablePrice: 450,
      priceAmountSnapshot: 500,
      liveInvoice: { originalAmount: 500, discountAmount: 0, amount: 500 },
      coveredAmount: 500,
    });
    expect(
      reason({
        hasOwner: false,
        hasTender: true,
        plan: overpaid,
        expected: fullTableUpgradeExpectation(overpaid),
      }),
    ).toContain("no tiene titular");
    expect(
      reason({
        hasOwner: true,
        hasTender: true,
        plan: overpaid,
        expected: fullTableUpgradeExpectation(overpaid),
      }),
    ).toBeNull();
  });

  it("never enables a button that has nothing to send", () => {
    expect(reason({ expected: null })).not.toBeNull();
  });
});

describe("full table upgrade card description", () => {
  it("offers the upgrade and its new price when the button is enabled", () => {
    expect(
      describeFullTableUpgradeCard({
        preview: preview(),
        disabledReason: null,
      }),
    ).toBe(
      "El espacio A1 forma parte de una mesa completa. Podés sumar la otra mitad (A2) a esta reserva, que pasa a tener el precio de la mesa: Bs450.",
    );
  });

  it("says the price stays when the reservation already bills the table", () => {
    const samePrice = plan({
      priceAmountSnapshot: 450,
      liveInvoice: { originalAmount: 450, discountAmount: 0, amount: 450 },
    });
    const text = describeFullTableUpgradeCard({
      preview: preview({
        plan: samePrice,
        expected: fullTableUpgradeExpectation(samePrice),
      }),
      disabledReason: null,
    });
    expect(text).toContain("que ya tiene el precio de la mesa (Bs450)");
    expect(text).not.toContain("pasa a tener");
  });

  /**
   * The table price less the late partner's payment is where the cobro
   * already sits; that says nothing about whether the cobro is paid.
   */
  it("never says a late partner's reservation already covers the table", () => {
    const samePrice = plan({
      priceAmountSnapshot: 250,
      liveInvoice: { originalAmount: 250, discountAmount: 0, amount: 250 },
      latePartnerPrepaid: 200,
    });
    const card = describeFullTableUpgradeCard({
      preview: preview({
        plan: samePrice,
        expected: fullTableUpgradeExpectation(samePrice),
      }),
      disabledReason: null,
    });
    expect(card).toContain(
      "que con lo pagado por el compañero ya queda en el precio de la mesa (Bs450)",
    );
    const charge = describeFullTableUpgradeCharge(samePrice);
    expect(charge).toContain("la reserva ya queda en el precio de la mesa");
    for (const text of [card, charge]) expect(text).not.toContain("cubre");
  });

  /** The disabled reason says why; the description must not promise otherwise. */
  it("stays neutral when the upgrade is blocked", () => {
    const text = describeFullTableUpgradeCard({
      preview: preview({ companionState: "occupied" }),
      disabledReason: "La otra mitad ya está ocupada por otra reserva.",
    });
    expect(text).toBe("El espacio A1 forma parte de una mesa completa con A2.");
    expect(text).not.toContain("Podés");
  });

  it("does not name a companion a malformed table does not have", () => {
    expect(
      describeFullTableUpgradeCard({
        preview: preview({
          groupIssue: "malformed",
          companion: null,
          companionState: null,
          plan: null,
          expected: null,
        }),
        disabledReason: "La mesa no tiene exactamente dos espacios.",
      }),
    ).toBe("El espacio A1 forma parte de una mesa completa.");
  });
});

describe("full table upgrade charge", () => {
  it("compares the cobro before and after, both net of the discount", () => {
    const text = describeFullTableUpgradeCharge(
      plan({
        liveInvoice: { originalAmount: 300, discountAmount: 50, amount: 250 },
      }),
    );
    // Gross 300 against net 400 would mix two different figures.
    expect(text).toContain("El cobro pasa de Bs250 a Bs400");
    expect(text).toContain("manteniendo el descuento de Bs50");
    expect(text).toContain("quedan como están");
  });

  it("does not mention a discount the cobro never had", () => {
    const text = describeFullTableUpgradeCharge(plan());
    expect(text).toContain("El cobro pasa de Bs300 a Bs450.");
    expect(text).not.toContain("descuento");
  });

  it("says so when the amount does not move", () => {
    const text = describeFullTableUpgradeCharge(
      plan({
        priceAmountSnapshot: 450,
        liveInvoice: { originalAmount: 450, discountAmount: 0, amount: 450 },
      }),
    );
    expect(text).toContain("El monto no cambia");
    expect(text).not.toContain("pasa de");
  });

  /** An external participant's reservation carries a price but no cobro. */
  it("speaks of the price on record when there is no cobro", () => {
    const text = describeFullTableUpgradeCharge(plan({ liveInvoice: null }));
    expect(text).toContain("no tiene cobro");
    expect(text).toContain("de Bs300 a Bs450");
    expect(text).not.toContain("El cobro pasa");
  });

  it("formats decimals the way the payments dialogs do", () => {
    const text = describeFullTableUpgradeCharge(
      plan({
        tablePrice: 450.5,
        liveInvoice: { originalAmount: 300, discountAmount: 0, amount: 300 },
      }),
    );
    expect(text).toContain("Bs450,50");
  });
});

describe("full table upgrade late partner", () => {
  it("says the late partner's difference counts as paid, and the fee does not", () => {
    const text = describeFullTableUpgradeLatePartner(
      plan({ coveredAmount: 300, latePartnerPrepaid: 200 }),
    );
    expect(text).toContain("Los Bs200 que el titular ya pagó en créditos");
    expect(text).toContain("cuentan como pagados");
    expect(text).toContain("precio de la mesa, Bs450, menos ese monto");
    expect(text).toContain("El cargo por agregarlo no se descuenta");
  });

  it("stays quiet without a late partner", () => {
    expect(describeFullTableUpgradeLatePartner(plan())).toBeNull();
  });
});

describe("full table upgrade write-off", () => {
  it("says an amount written off is kept off the new cobro", () => {
    const text = describeFullTableUpgradeWriteOff(
      plan({
        liveInvoice: { originalAmount: 300, discountAmount: 0, amount: 200 },
        coveredAmount: 200,
      }),
    );
    expect(text).toContain("Bs100 que se dio por saldado se mantiene");
    expect(text).not.toContain("no se mantiene");
  });

  it("stays quiet with nothing written off", () => {
    expect(describeFullTableUpgradeWriteOff(plan())).toBeNull();
  });

  /** Without a price change the cobro is not repriced, so the write-off stays. */
  it("stays quiet when the cobro is not repriced", () => {
    expect(
      describeFullTableUpgradeWriteOff(
        plan({
          priceAmountSnapshot: 450,
          liveInvoice: { originalAmount: 450, discountAmount: 0, amount: 400 },
          coveredAmount: 400,
        }),
      ),
    ).toBeNull();
  });
});

describe("full table upgrade settlement", () => {
  it("reopens a paid reservation for the difference", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({ coveredAmount: 300, reservationStatus: "accepted" }),
      reservationStatus: "accepted",
    });
    expect(text).toBe(
      "Ya hay Bs300 pagados. La reserva vuelve a quedar pendiente por la diferencia de Bs150, con cinco días para pagarla.",
    );
  });

  it("keeps a pending partial payer pending with a fresh deadline", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({ coveredAmount: 100 }),
      reservationStatus: "pending",
    });
    expect(text).toContain("sigue pendiente por la diferencia de Bs350");
    expect(text).toContain("vuelve a tener cinco días");
    expect(text).not.toContain("vuelve a quedar pendiente");
  });

  it("hands a surplus back as credits", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({
        priceAmountSnapshot: 500,
        liveInvoice: { originalAmount: 500, discountAmount: 0, amount: 500 },
        coveredAmount: 500,
        reservationStatus: "accepted",
      }),
      reservationStatus: "accepted",
    });
    expect(text).toContain("Ya hay Bs500 pagados, más que el nuevo monto");
    expect(text).toContain("Los Bs50 de diferencia vuelven como créditos");
    expect(text).not.toContain("queda confirmada");
  });

  it("counts a late partner's payment in what is already paid", () => {
    // Cobro 300 paid, 200 paid by the late partner: 500 of a 450 table.
    const text = describeFullTableUpgradeSettlement({
      plan: plan({
        coveredAmount: 300,
        latePartnerPrepaid: 200,
        reservationStatus: "accepted",
      }),
      reservationStatus: "accepted",
    });
    // Measured against the table, not the Bs250 cobro the charge line shows:
    // 500 − 250 is not the 50 that comes back.
    expect(text).toBe(
      "Ya hay Bs500 pagados (Bs300 del cobro y Bs200 por el compañero), más que los Bs450 de la mesa. Los Bs50 de diferencia vuelven como créditos al titular.",
    );
    expect(text).not.toContain("el nuevo monto");
  });

  it("reconciles a late partner's balance against the table price", () => {
    // I500 cobro paid, L300, a 1200 table: the cobro becomes 900, and 800 of
    // the 1200 is paid — 400 owed, which 900 − 800 would not give.
    const text = describeFullTableUpgradeSettlement({
      plan: plan({
        tablePrice: 1200,
        priceAmountSnapshot: 500,
        liveInvoice: { originalAmount: 500, discountAmount: 0, amount: 500 },
        coveredAmount: 500,
        latePartnerPrepaid: 300,
        reservationStatus: "accepted",
      }),
      reservationStatus: "accepted",
    });
    expect(text).toBe(
      "Ya hay Bs800 pagados (Bs500 del cobro y Bs300 por el compañero) de los Bs1.200 de la mesa. La reserva vuelve a quedar pendiente por la diferencia de Bs400, con cinco días para pagarla.",
    );
  });

  it("confirms a late partner's pending reservation the table leaves exactly paid", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({ coveredAmount: 250, latePartnerPrepaid: 200 }),
      reservationStatus: "pending",
    });
    expect(text).toBe(
      "Ya hay Bs450 pagados (Bs250 del cobro y Bs200 por el compañero), que cubren los Bs450 de la mesa. La reserva queda confirmada.",
    );
  });

  it("confirms a pending reservation the upgrade leaves exactly paid", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({
        priceAmountSnapshot: 500,
        liveInvoice: { originalAmount: 500, discountAmount: 0, amount: 500 },
        coveredAmount: 450,
      }),
      reservationStatus: "pending",
    });
    expect(text).toBe(
      "Ya hay Bs450 pagados, que cubren el nuevo monto. La reserva queda confirmada.",
    );
  });

  it("confirms a pending reservation it overpays, besides the credits", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({
        priceAmountSnapshot: 500,
        liveInvoice: { originalAmount: 500, discountAmount: 0, amount: 500 },
        coveredAmount: 500,
      }),
      reservationStatus: "pending",
    });
    expect(text).toContain("vuelven como créditos al titular.");
    expect(text).toContain("La reserva queda confirmada.");
  });

  it("only moves the amount of an unpaid pending reservation", () => {
    expect(
      describeFullTableUpgradeSettlement({
        plan: plan(),
        reservationStatus: "pending",
      }),
    ).toBe("Todavía no hay pagos registrados: solo cambia el monto a pagar.");
  });

  it("says an exact cover resolves itself", () => {
    expect(
      describeFullTableUpgradeSettlement({
        plan: plan({ coveredAmount: 450, reservationStatus: "accepted" }),
        reservationStatus: "accepted",
      }),
    ).toBe("Lo ya pagado cubre el nuevo monto.");
  });

  /**
   * Accepted at no cost — a Bs0 cobro, or an approved zero-value entitlement.
   * It owes the difference like a paid reservation (Dennis, 2026-09-29);
   * #551's copy promised the opposite.
   */
  it("asks an accepted reservation confirmed at no cost for the difference", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({
        liveInvoice: { originalAmount: 300, discountAmount: 300, amount: 0 },
        reservationStatus: "accepted",
      }),
      reservationStatus: "accepted",
    });
    expect(text).toBe(
      "La reserva se había confirmado sin costo. Vuelve a quedar pendiente por la diferencia de Bs150, con cinco días para pagarla.",
    );
    expect(text).not.toContain("no se le pide");
  });

  /**
   * A positive cobro marked paid with no payment rows was paid outside the
   * system. Dennis's rule covers only reservations confirmed at no cost, so
   * this one keeps the pre-batch behaviour and the dialog must not promise a
   * balance the service will not open.
   */
  it("says a cobro paid outside the system only has its amount moved", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({ reservationStatus: "accepted" }),
      reservationStatus: "accepted",
    });
    expect(text).toBe(
      "La reserva figura como pagada sin pagos registrados en el sistema: solo cambia el monto del cobro. No vuelve a quedar pendiente ni se le pide la diferencia.",
    );
  });

  it("asks for the difference once a zero-value entitlement was approved, even on a positive cobro", () => {
    const text = describeFullTableUpgradeSettlement({
      plan: plan({
        reservationStatus: "accepted",
        zeroValueEntitlementApproved: true,
      }),
      reservationStatus: "accepted",
    });
    expect(text).toBe(
      "La reserva se había confirmado sin costo. Vuelve a quedar pendiente por la diferencia de Bs450, con cinco días para pagarla.",
    );
  });

  it("has nothing to add for an accepted reservation still owing nothing", () => {
    expect(
      describeFullTableUpgradeSettlement({
        plan: plan({
          liveInvoice: { originalAmount: 300, discountAmount: 1000, amount: 0 },
          reservationStatus: "accepted",
        }),
        reservationStatus: "accepted",
      }),
    ).toBe("La reserva sigue confirmada y no queda nada por pagar.");
  });

  it("does not call the cobro unpaid a late partner partly paid, beyond what is said", () => {
    expect(
      describeFullTableUpgradeSettlement({
        plan: plan({ latePartnerPrepaid: 100 }),
        reservationStatus: "pending",
      }),
    ).toBe("Todavía no hay pagos del cobro: solo cambia el monto a pagar.");
  });

  it("has nothing to say without a cobro or without a price change", () => {
    expect(
      describeFullTableUpgradeSettlement({
        plan: plan({ liveInvoice: null }),
        reservationStatus: "accepted",
      }),
    ).toBeNull();
    expect(
      describeFullTableUpgradeSettlement({
        plan: plan({
          priceAmountSnapshot: 450,
          liveInvoice: { originalAmount: 450, discountAmount: 0, amount: 450 },
          coveredAmount: 450,
        }),
        reservationStatus: "accepted",
      }),
    ).toBeNull();
  });
});

describe("full table upgrade dialog copy", () => {
  function paragraphs(
    overrides: Partial<Parameters<typeof describeFullTableUpgrade>[0]> = {},
  ) {
    return describeFullTableUpgrade({
      plan: plan(),
      reservationStatus: "pending",
      keptStandLabel: "A1",
      companionStandLabel: "A2",
      hasTender: false,
      ...overrides,
    });
  }

  it("names both halves first", () => {
    expect(paragraphs()[0]).toBe(
      "La reserva suma el espacio A2 y pasa a ocupar la mesa completa: A1 y A2.",
    );
  });

  it("says no credits are charged and nobody is notified", () => {
    const text = paragraphs().join(" ");
    expect(text).toContain("No se cobran créditos por la mesa completa");
    expect(text).toContain("no se le envía ningún aviso al participante");
    expect(text).not.toContain("recordatorio");
  });

  /**
   * The downgrade refuses once any payment or credit row exists, so after an
   * upgrade with money on it there is no way back to half a table.
   */
  it("warns that money on the reservation makes the upgrade one-way", () => {
    expect(paragraphs({ hasTender: true }).join(" ")).toContain(
      "después no vas a poder reducirla a media mesa",
    );
    expect(paragraphs({ hasTender: false }).join(" ")).not.toContain(
      "reducirla",
    );
  });

  /**
   * A reopened balance always has somebody to remind now: the owner, or on a
   * legacy row with none, the cobro's holder (item 11). #551 left ownerless
   * reservations without a task, and the copy stayed quiet for them.
   */
  it("mentions the rescheduled reminder whenever a balance reopens", () => {
    const balance = paragraphs({
      plan: plan({ coveredAmount: 300, reservationStatus: "accepted" }),
      reservationStatus: "accepted",
      hasTender: true,
    }).join(" ");
    expect(balance).toContain(
      "El recordatorio de pago se reprograma para un día antes del nuevo vencimiento.",
    );

    const nothingOwed = paragraphs({
      plan: plan({ coveredAmount: 450, reservationStatus: "accepted" }),
      reservationStatus: "accepted",
      hasTender: true,
    }).join(" ");
    expect(nothingOwed).not.toContain("recordatorio");
  });

  it("includes the late partner, the write-off and the settlement in order", () => {
    const list = paragraphs({
      plan: plan({
        liveInvoice: { originalAmount: 300, discountAmount: 0, amount: 200 },
        coveredAmount: 200,
        latePartnerPrepaid: 50,
        reservationStatus: "accepted",
      }),
      reservationStatus: "accepted",
      hasTender: true,
    });
    const latePartner = list.findIndex((p) => p.includes("compañero"));
    const writeOff = list.findIndex((p) => p.includes("se dio por saldado"));
    // 450 - 50 late partner - 100 written off = 300 against 200 covered.
    const settlement = list.findIndex((p) => p.includes("diferencia de Bs100"));
    expect(latePartner).toBe(2);
    expect(writeOff).toBe(latePartner + 1);
    expect(settlement).toBe(writeOff + 1);
    // With a write-off, what the table asks is below its price; the figures
    // still add up: 350 − 250 = 100.
    expect(list[settlement]).toContain(
      "Ya hay Bs250 pagados (Bs200 del cobro y Bs50 por el compañero) de los Bs350 que cuesta la mesa con lo ya descontado.",
    );
  });

  it("never says factura", () => {
    const text = paragraphs({
      plan: plan({
        liveInvoice: { originalAmount: 300, discountAmount: 50, amount: 200 },
        coveredAmount: 100,
      }),
      hasTender: true,
    })
      .join(" ")
      .toLowerCase();
    expect(text).not.toContain("factura");
  });
});
