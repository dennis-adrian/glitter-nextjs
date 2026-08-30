import { describe, expect, it } from "vitest";

import { compareParticipantDisplayNames } from "@/app/components/next_event/participants/compare-display-names";

type Named = { displayName: string | null };

describe("participant displayName comparator", () => {
  it("is antisymmetric when one displayName is null", () => {
    const unnamed: Named = { displayName: null };
    const named: Named = { displayName: "Zelda" };

    const forward = compareParticipantDisplayNames(unnamed, named);
    const reverse = compareParticipantDisplayNames(named, unnamed);

    expect(forward).not.toBe(0);
    expect(reverse).not.toBe(0);
    expect(Math.sign(forward)).toBe(-Math.sign(reverse));
  });

  it("sorts null displayNames before non-empty names", () => {
    const participants: Named[] = [
      { displayName: "Zelda" },
      { displayName: null },
      { displayName: "Ada" },
      { displayName: null },
    ];

    expect(
      [...participants]
        .sort(compareParticipantDisplayNames)
        .map((participant) => participant.displayName),
    ).toEqual([null, null, "Ada", "Zelda"]);
  });
});
