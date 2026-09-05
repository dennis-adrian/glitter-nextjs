import { describe, expect, it } from "vitest";

import {
  participantStatusCopy,
  statusAllowsRelease,
} from "@/app/lib/reservations/participant-status";
import { reservationStatusEnum } from "@/db/schema";

describe("participantStatusCopy", () => {
  it("covers every status the database can hold", () => {
    for (const status of reservationStatusEnum.enumValues) {
      expect(participantStatusCopy(status), status).not.toBeNull();
    }
  });

  it("returns null for something that is not a status", () => {
    expect(participantStatusCopy("banana")).toBeNull();
  });

  /**
   * Someone who does not know they are blocked will keep trying to reserve and
   * hit a wall with no explanation, so the closed states have to say it.
   */
  it("tells a participant with a closed reservation that they cannot rebook", () => {
    const copy = participantStatusCopy("rejected");

    expect(copy?.whatNext).toContain("No vas a poder hacer otra reserva");
    expect(copy?.isLive).toBe(false);
  });

  /** A release is the one closed state that leaves them free to try again. */
  it("tells a released participant they can reserve again", () => {
    const copy = participantStatusCopy("released");

    expect(copy?.whatNext).toContain("nueva reserva");
    expect(copy?.isLive).toBe(false);
  });

  it("asks for nothing while a payment is under review", () => {
    const copy = participantStatusCopy("verification_payment");

    expect(copy?.tone).toBe("waiting");
    expect(copy?.whatNext).toContain("No tenés que hacer nada");
  });

  it("keeps penalty language out of every status", () => {
    for (const status of reservationStatusEnum.enumValues) {
      const copy = participantStatusCopy(status)!;
      const text =
        `${copy.label} ${copy.description} ${copy.whatNext ?? ""}`.toLowerCase();
      expect(text, status).not.toContain("multa");
      expect(text, status).not.toContain("penaliz");
      expect(text, status).not.toContain("sanci");
      expect(text, status).not.toContain("castig");
    }
  });

  it("marks exactly the live statuses as holding a stand", () => {
    const live = reservationStatusEnum.enumValues.filter(
      (status) => participantStatusCopy(status)?.isLive,
    );

    expect(live).toEqual(["pending", "verification_payment", "accepted"]);
  });
});

describe("statusAllowsRelease", () => {
  /**
   * PRD §9.2. Everything else is a refund question or already closed, and
   * allowing it is what would turn a change fee into a refund policy.
   */
  it("allows release only from pending", () => {
    const releasable =
      reservationStatusEnum.enumValues.filter(statusAllowsRelease);

    expect(releasable).toEqual(["pending"]);
  });
});
