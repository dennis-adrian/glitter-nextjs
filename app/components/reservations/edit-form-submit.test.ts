import { describe, expect, it } from "vitest";

import {
  COMBINED_SETTLEMENT_AND_PARTNER_MESSAGE,
  UNSUPPORTED_STATUS_MESSAGE,
  planReservationEditSubmit,
} from "@/app/components/reservations/edit-form-submit";

describe("planReservationEditSubmit", () => {
  it("rejects combined partner and status changes", () => {
    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: true,
        nextStatus: "accepted",
      }),
    ).toEqual({
      kind: "unsupported_combination",
      message: COMBINED_SETTLEMENT_AND_PARTNER_MESSAGE,
    });

    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: true,
        nextStatus: "pending",
      }),
    ).toEqual({
      kind: "unsupported_combination",
      message: COMBINED_SETTLEMENT_AND_PARTNER_MESSAGE,
    });
  });

  it("routes status-only accepted and rejected through dedicated actions", () => {
    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: false,
        nextStatus: "accepted",
      }),
    ).toEqual({ kind: "confirm" });

    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: false,
        nextStatus: "rejected",
      }),
    ).toEqual({ kind: "reject" });
  });

  it("routes partner-only edits through the partner command", () => {
    expect(
      planReservationEditSubmit({
        statusChanged: false,
        partnerChanged: true,
        nextStatus: "pending",
      }),
    ).toEqual({ kind: "partner" });
  });

  it("rejects payment-status edits from the reservation form", () => {
    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: false,
        nextStatus: "pending",
      }),
    ).toEqual({
      kind: "unsupported_status",
      message: UNSUPPORTED_STATUS_MESSAGE,
    });

    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: false,
        nextStatus: "verification_payment",
      }),
    ).toEqual({
      kind: "unsupported_status",
      message: UNSUPPORTED_STATUS_MESSAGE,
    });
  });

  it("returns noop when nothing changed", () => {
    expect(
      planReservationEditSubmit({
        statusChanged: false,
        partnerChanged: false,
        nextStatus: "pending",
      }),
    ).toEqual({ kind: "noop" });
  });
});
