import { describe, expect, it } from "vitest";

import {
  COMBINED_SETTLEMENT_AND_PARTNER_MESSAGE,
  planReservationEditSubmit,
} from "@/app/components/reservations/edit-form-submit";

describe("planReservationEditSubmit", () => {
  it("rejects combined partner and accepted status changes", () => {
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
  });

  it("rejects combined partner and rejected status changes", () => {
    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: true,
        nextStatus: "rejected",
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

  it("keeps generic updates for partner-only and non-settlement status mixes", () => {
    expect(
      planReservationEditSubmit({
        statusChanged: false,
        partnerChanged: true,
        nextStatus: "pending",
      }),
    ).toEqual({ kind: "generic" });

    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: true,
        nextStatus: "pending",
      }),
    ).toEqual({ kind: "generic" });

    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: true,
        nextStatus: "verification_payment",
      }),
    ).toEqual({ kind: "generic" });

    expect(
      planReservationEditSubmit({
        statusChanged: true,
        partnerChanged: false,
        nextStatus: "pending",
      }),
    ).toEqual({ kind: "generic" });
  });
});
