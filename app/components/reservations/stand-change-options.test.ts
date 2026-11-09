import { describe, expect, it } from "vitest";

import {
  describeStandChangeMoney,
  standChangeDisabledReason,
  toStandChangeChoice,
} from "@/app/components/reservations/stand-change-options";
import type { StandChangeOption } from "@/app/lib/reservations/stand-change-queries";

function option(overrides: Partial<StandChangeOption> = {}): StandChangeOption {
  return {
    standId: 2,
    label: "A",
    standNumber: 7,
    standCategory: "illustration",
    sectorId: 1,
    sectorName: "Sector 1",
    individualPrice: 300,
    sharedPrice: null,
    status: "available",
    occupant: null,
    heldNow: false,
    ...overrides,
  };
}

describe("stand change choices", () => {
  it("offers a free stand", () => {
    const choice = toStandChangeChoice(option(), 1);
    expect(choice.disabledReason).toBeNull();
    expect(choice.exchangeWith).toBeNull();
    expect(choice.label).toContain("A7");
    expect(choice.label).toContain("Sector 1");
    // The database enum is English; the label an admin reads must not be.
    expect(choice.label).toContain("Ilustración");
    expect(choice.label).not.toContain("illustration");
    expect(choice.label).toContain("300,00");
  });

  it("keeps an occupied stand selectable and names who is on it", () => {
    const choice = toStandChangeChoice(
      option({
        occupant: {
          reservationId: 9,
          status: "pending",
          displayName: "Ana",
          isFullTable: false,
        },
      }),
      1,
    );
    expect(choice.disabledReason).toBeNull();
    expect(choice.exchangeWith).toBe("Ana");
  });

  it("disables a stand held by a live checkout", () => {
    const choice = toStandChangeChoice(option({ heldNow: true }), 1);
    expect(choice.disabledReason).toContain("reservando");
  });

  it("disables a stand occupied by a full table", () => {
    const choice = toStandChangeChoice(
      option({
        occupant: {
          reservationId: 9,
          status: "pending",
          displayName: "Ana",
          isFullTable: true,
        },
      }),
      1,
    );
    expect(choice.disabledReason).toContain("mesa completa");
    expect(choice.exchangeWith).toBeNull();
  });

  it("disables the stand the reservation already occupies", () => {
    const choice = toStandChangeChoice(option({ standId: 5 }), 5);
    expect(choice.disabledReason).toContain("ya ocupa");
  });

  it("offers a disabled stand, which is how an admin allocates one by hand", () => {
    const choice = toStandChangeChoice(option({ status: "disabled" }), 1);
    expect(choice.disabledReason).toBeNull();
  });
});

describe("stand change availability", () => {
  it("allows a single-stand live reservation for a global admin", () => {
    expect(
      standChangeDisabledReason({
        isGlobalAdmin: true,
        liveMemberCount: 1,
        reservationStatus: "pending",
      }),
    ).toBeNull();
  });

  it("refuses a festival admin", () => {
    expect(
      standChangeDisabledReason({
        isGlobalAdmin: false,
        liveMemberCount: 1,
        reservationStatus: "pending",
      }),
    ).toContain("administrador general");
  });

  it("refuses a full table and says how to proceed", () => {
    expect(
      standChangeDisabledReason({
        isGlobalAdmin: true,
        liveMemberCount: 2,
        reservationStatus: "accepted",
      }),
    ).toContain("media mesa");
  });

  it("refuses a reservation that no longer occupies a stand", () => {
    expect(
      standChangeDisabledReason({
        isGlobalAdmin: true,
        liveMemberCount: 1,
        reservationStatus: "rejected",
      }),
    ).toContain("ya no ocupa");
  });
});

describe("stand change money copy", () => {
  it("speaks of one cobro for a switch and of each for an exchange", () => {
    expect(describeStandChangeMoney({ isExchange: false })[0]).toMatch(
      /^El cobro pasa a ser el del espacio nuevo/,
    );
    expect(describeStandChangeMoney({ isExchange: true })[0]).toMatch(
      /^Cada cobro pasa a ser el del espacio nuevo/,
    );
  });

  /** Every rule the shared repricing model applies, and none it does not. */
  it("states the late partner, write-off, free-confirmed and acceptance rules", () => {
    const text = describeStandChangeMoney({ isExchange: false }).join(" ");
    expect(text).toContain("cualquier monto que se haya dado por saldado");
    expect(text).toContain(
      "Lo que el titular ya pagó en créditos al agregar a un compañero",
    );
    expect(text).toContain("o la reserva se confirmó sin costo");
    expect(text).toContain("una reserva pendiente queda confirmada");
    expect(text).toContain("lo pagado de más vuelve como créditos");
    expect(text).toContain("comprobante en revisión");
    // Only a reservation confirmed at no cost owes the difference; one marked
    // paid with no payment rows was paid outside the system.
    expect(text).toContain(
      "Una reserva que figura como pagada sin pagos registrados en el sistema solo cambia de monto",
    );
  });

  /**
   * The settlement turns on the new amount against what is already paid, not
   * on which stand costs more: Bs200 paid of a Bs500 cobro, moved to a Bs400
   * stand, still owes Bs200 and is not confirmed.
   */
  it("compares the new amount with what is paid, never the stand prices", () => {
    const text = describeStandChangeMoney({ isExchange: false }).join(" ");
    expect(text).toContain("Si el nuevo monto supera lo ya pagado");
    expect(text).toContain("aunque el espacio nuevo cueste menos");
    expect(text).toContain("Si lo ya pagado supera el nuevo monto");
    expect(text).toContain(
      "Una reserva pendiente sin pagos solo cambia de monto",
    );
    expect(text).not.toMatch(/cuesta (más|menos)/);
    expect(text).not.toContain("la reserva queda confirmada");
  });

  it("never says factura", () => {
    for (const isExchange of [false, true]) {
      expect(
        describeStandChangeMoney({ isExchange }).join(" ").toLowerCase(),
      ).not.toContain("factura");
    }
  });
});
