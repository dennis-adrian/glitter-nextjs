// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  clearVolunteerDraft,
  readVolunteerDraft,
  volunteerDraftKey,
  writeVolunteerDraft,
} from "@/app/lib/volunteers/draft";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const offered = { roleIds: [11, 12], shiftIds: [21, 22] };

describe("volunteer draft", () => {
  it("round-trips the answers and the step, without the honeypot", () => {
    const storage = memoryStorage();
    writeVolunteerDraft(storage, 7, {
      step: 2,
      values: {
        fullName: "Camila Rojas",
        shiftIds: [21],
        firstChoiceRoleId: "11",
        imageConsent: true,
        website: "spam",
      },
    });

    expect(storage.map.get(volunteerDraftKey(7))).not.toContain("spam");
    expect(readVolunteerDraft(storage, 7, offered)).toEqual({
      step: 2,
      values: {
        fullName: "Camila Rojas",
        shiftIds: [21],
        firstChoiceRoleId: "11",
        imageConsent: true,
      },
    });
  });

  it("drops shifts and roles that are no longer offered, and unknown fields", () => {
    const storage = memoryStorage();
    writeVolunteerDraft(storage, 7, {
      step: 1,
      values: {
        shiftIds: [21, 99],
        firstChoiceRoleId: "99",
        secondChoiceRoleId: "12",
        experience: ["events", "hacking"],
        referralSource: "radio",
        admin: true,
      },
    });
    expect(readVolunteerDraft(storage, 7, offered)?.values).toEqual({
      shiftIds: [21],
      secondChoiceRoleId: "12",
      experience: ["events"],
    });
  });

  it("is per festival, and clears", () => {
    const storage = memoryStorage();
    writeVolunteerDraft(storage, 7, { step: 0, values: { fullName: "A" } });
    expect(readVolunteerDraft(storage, 8, offered)).toBeNull();
    clearVolunteerDraft(storage, 7);
    expect(readVolunteerDraft(storage, 7, offered)).toBeNull();
  });

  it("ignores garbage, other versions and out-of-range steps", () => {
    const storage = memoryStorage();
    storage.setItem(volunteerDraftKey(7), "{not json");
    expect(readVolunteerDraft(storage, 7, offered)).toBeNull();
    storage.setItem(
      volunteerDraftKey(7),
      JSON.stringify({ version: 99, step: 1, values: {} }),
    );
    expect(readVolunteerDraft(storage, 7, offered)).toBeNull();
    storage.setItem(
      volunteerDraftKey(7),
      JSON.stringify({ version: 1, step: 42, values: {} }),
    );
    expect(readVolunteerDraft(storage, 7, offered)?.step).toBe(3);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() =>
      writeVolunteerDraft(broken, 7, { step: 0, values: {} }),
    ).not.toThrow();
    expect(readVolunteerDraft(broken, 7, offered)).toBeNull();
    expect(() => clearVolunteerDraft(broken, 7)).not.toThrow();
  });
});
