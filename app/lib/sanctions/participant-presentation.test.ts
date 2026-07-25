import { describe, expect, it } from "vitest";

import { getParticipantSanctionConsequence } from "@/app/lib/sanctions/mappers";

describe("getParticipantSanctionConsequence", () => {
  it("makes clear that warnings do not block reservations", () => {
    expect(
      getParticipantSanctionConsequence({
        type: "warning",
        status: "active",
      }),
    ).toContain("no bloquea");
  });

  it("makes clear that a current ban blocks reservation access", () => {
    expect(
      getParticipantSanctionConsequence({
        type: "ban",
        status: "active",
      }),
    ).toContain("no podés acceder");
  });

  it("explains that reservation delays end at the displayed waiting time", () => {
    expect(
      getParticipantSanctionConsequence({
        type: "reservation_delay",
        status: "scheduled",
      }),
    ).toContain("cuando finaliza el período de espera");
  });

  it("uses historical wording for expired restrictions", () => {
    expect(
      getParticipantSanctionConsequence({
        type: "ban",
        status: "expired",
      }),
    ).toContain("bloqueó");
  });
});
