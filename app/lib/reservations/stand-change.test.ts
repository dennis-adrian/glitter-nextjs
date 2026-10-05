import { describe, expect, it } from "vitest";

import {
  isMovableReservationStatus,
  resolveStandChangePricing,
} from "@/app/lib/reservations/stand-change";

describe("movable reservation statuses", () => {
  it("accepts exactly the statuses that occupy a stand", () => {
    expect(isMovableReservationStatus("pending")).toBe(true);
    expect(isMovableReservationStatus("verification_payment")).toBe(true);
    expect(isMovableReservationStatus("accepted")).toBe(true);
  });

  it("refuses statuses that gave the stand up", () => {
    expect(isMovableReservationStatus("rejected")).toBe(false);
    expect(isMovableReservationStatus("cancelled")).toBe(false);
    expect(isMovableReservationStatus("released")).toBe(false);
  });
});

describe("stand change pricing", () => {
  it("bills the individual price for a single participant", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 1 },
      { individualPrice: 450, sharedPrice: 700 },
    );
    expect(pricing).toEqual({
      standPrice: 450,
      individualPrice: 450,
      sharedPrice: 700,
    });
  });

  it("bills the shared price once a partner is on the reservation", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 2 },
      { individualPrice: 450, sharedPrice: 700 },
    );
    expect(pricing.standPrice).toBe(700);
  });

  it("falls back to the individual price when the destination has no shared one", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 2 },
      { individualPrice: 450, sharedPrice: null },
    );
    expect(pricing.standPrice).toBe(450);
    expect(pricing.sharedPrice).toBeNull();
  });

  it("rounds to cents", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 1 },
      { individualPrice: 100.005, sharedPrice: 200.004 },
    );
    expect(pricing.standPrice).toBe(100.01);
    expect(pricing.sharedPrice).toBe(200);
  });
});
