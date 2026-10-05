import { describe, expect, it } from "vitest";

import {
  RESERVATION_STATUS_LABELS,
  reservationStatusLabel,
} from "@/app/lib/reservations/status-labels";

describe("reservationStatusLabel", () => {
  it("names every reservation status in Spanish", () => {
    expect(reservationStatusLabel("pending")).toBe("Pendiente");
    expect(reservationStatusLabel("accepted")).toBe("Confirmada");
    expect(reservationStatusLabel("verification_payment")).toBe(
      "Verificación de Pago",
    );
    expect(reservationStatusLabel("rejected")).toBe("Rechazada");
    expect(reservationStatusLabel("cancelled")).toBe("Cancelada");
    expect(reservationStatusLabel("released")).toBe("Liberada");
  });

  it("agrees with the map the status badge renders", () => {
    for (const [status, label] of Object.entries(RESERVATION_STATUS_LABELS)) {
      expect(reservationStatusLabel(status)).toBe(label);
    }
  });

  /**
   * The event log stores statuses as text. A value nobody mapped still reads
   * as what it is, rather than as an empty arrow.
   */
  it("falls back to the raw value for a status it does not know", () => {
    expect(reservationStatusLabel("archived")).toBe("archived");
    expect(reservationStatusLabel("")).toBe("");
  });

  /** An inherited key is not a status, and must not render as a function. */
  it("does not treat object prototype keys as labels", () => {
    expect(reservationStatusLabel("constructor")).toBe("constructor");
    expect(reservationStatusLabel("toString")).toBe("toString");
  });
});
