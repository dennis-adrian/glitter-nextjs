import { describe, expect, it } from "vitest";

import { toFullTableChoice } from "@/app/components/reservations/full-table-choices";
import type { FullTableOption } from "@/app/lib/reservations/stand-change-queries";

function option(overrides: Partial<FullTableOption> = {}): FullTableOption {
  return {
    standId: 1,
    label: "A",
    standNumber: 1,
    standCategory: "illustration",
    sectorId: 1,
    sectorName: "Sector 1",
    groupId: 7,
    fullTablePrice: 800,
    companionStandId: 2,
    companionLabel: "A",
    companionStandNumber: 2,
    selfAvailable: true,
    companionAvailable: true,
    ...overrides,
  };
}

describe("full table choices", () => {
  it("names both halves and the table price", () => {
    const choice = toFullTableChoice(option());
    expect(choice.disabledReason).toBeNull();
    expect(choice.label).toContain("A1 + A2");
    expect(choice.label).toContain("800,00");
    expect(choice.companionLabel).toBe("A2");
  });

  it("lists an unpriced table with its reason rather than hiding it", () => {
    const choice = toFullTableChoice(option({ fullTablePrice: null }));
    expect(choice.disabledReason).toContain("precio");
  });

  it("lists a malformed group with its reason", () => {
    const choice = toFullTableChoice(
      option({
        companionStandId: null,
        companionLabel: null,
        companionStandNumber: null,
      }),
    );
    expect(choice.disabledReason).toContain("dos espacios");
  });

  it("disables a table whose companion is taken", () => {
    const choice = toFullTableChoice(option({ companionAvailable: false }));
    expect(choice.disabledReason).toContain("otra mitad");
  });

  it("disables a table whose picked half is taken", () => {
    const choice = toFullTableChoice(option({ selfAvailable: false }));
    expect(choice.disabledReason).toContain("Este espacio");
  });
});
