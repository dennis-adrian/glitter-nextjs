import { describe, expect, it } from "vitest";

import { DEFAULT_CREDENTIAL_RULES } from "@/app/lib/credentials/definitions";
import {
  addExtraCredentialSchema,
  createPrintBatchSchema,
  createStaffMemberSchema,
  externalCredentialQuantitySchema,
  festivalStaffMemberSchema,
  printBatchRefSchema,
  removeExtraCredentialSchema,
  resetCredentialRulesSchema,
  saveCredentialRulesSchema,
  updateExtraCredentialSchema,
  updateStaffMemberSchema,
} from "@/app/lib/credentials/schema";

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error!.issues[0]!.message;

const rules = {
  illustration: { quantity: 2, namingMode: "one_per_participant" },
  entrepreneurship: { quantity: 2, namingMode: "one_per_participant" },
  gastronomy: { quantity: 2, namingMode: "all_named" },
  external: { quantity: 2 },
  volunteer: { quantity: 1 },
  staff: { quantity: 1 },
};

describe("saveCredentialRulesSchema", () => {
  it("accepts the defaults and coerces typed numbers", () => {
    const parsed = saveCredentialRulesSchema.parse({
      festivalId: "4",
      rules: { ...rules, staff: { quantity: "3" } },
      baseRules: rules,
    });
    expect(parsed.festivalId).toBe(4);
    expect(parsed.rules.staff.quantity).toBe(3);
    expect(parsed.rules.gastronomy).toEqual(DEFAULT_CREDENTIAL_RULES.gastronomy);
  });

  it("keeps quantities between 0 and 20, whole", () => {
    const at = (quantity: unknown) =>
      saveCredentialRulesSchema.safeParse({
        festivalId: 1,
        rules: { ...rules, volunteer: { quantity } },
        baseRules: rules,
      });
    expect(at(0).success).toBe(true);
    expect(at(20).success).toBe(true);
    expect(firstMessage(at(21))).toBe("La cantidad puede ser como máximo 20.");
    expect(firstMessage(at(-1))).toBe("La cantidad no puede ser negativa.");
    expect(firstMessage(at(1.5))).toBe("La cantidad tiene que ser un número entero.");
  });

  it("refuses a cleared field instead of saving it as no credentials", () => {
    const at = (quantity: unknown) =>
      saveCredentialRulesSchema.safeParse({
        festivalId: 1,
        rules: { ...rules, volunteer: { quantity } },
        baseRules: rules,
      });
    for (const blank of ["", "   ", null, undefined, true, "abc", "3 credenciales"]) {
      expect(firstMessage(at(blank))).toBe("La cantidad tiene que ser un número.");
    }
    expect(at("0").success && at("0").data.rules.volunteer.quantity).toBe(0);
    expect(at(" 4 ").success && at(" 4 ").data.rules.volunteer.quantity).toBe(4);
  });

  it("refuses an unknown naming mode and a bad festival id", () => {
    expect(
      firstMessage(
        saveCredentialRulesSchema.safeParse({
          festivalId: 1,
          rules: { ...rules, gastronomy: { quantity: 2, namingMode: "half" } },
          baseRules: rules,
        }),
      ),
    ).toBe("Elegí cuáles llevan nombre.");
    expect(
      saveCredentialRulesSchema.safeParse({ festivalId: 0, rules, baseRules: rules }).success,
    ).toBe(false);
    expect(
      saveCredentialRulesSchema.safeParse({
        festivalId: 2_147_483_648,
        rules,
        baseRules: rules,
      }).success,
    ).toBe(false);
  });

  it("needs the rules the form was based on, for a save and a reset", () => {
    const missing = "Actualizá la página y revisá las reglas antes de guardar.";
    expect(firstMessage(saveCredentialRulesSchema.safeParse({ festivalId: 1, rules }))).toBe(
      missing,
    );
    expect(firstMessage(resetCredentialRulesSchema.safeParse({ festivalId: 1 }))).toBe(missing);
    const reset = resetCredentialRulesSchema.parse({
      festivalId: 1,
      baseRules: { ...rules, staff: { quantity: "3" } },
    });
    expect(reset.baseRules.staff.quantity).toBe(3);
  });
});

describe("externalCredentialQuantitySchema", () => {
  it("needs the stand count a total was typed against, but not to clear", () => {
    const at = (quantity: unknown, standCount?: unknown) =>
      externalCredentialQuantitySchema.safeParse({
        festivalId: 1,
        externalParticipantId: 2,
        quantity,
        standCount,
      });
    expect(firstMessage(at(3))).toBe("Actualizá la página y revisá la cantidad.");
    const typed = at(3, "2");
    expect(typed.success && typed.data.standCount).toBe(2);
    expect(at(null).success).toBe(true);
  });

  it("takes 0 to 50, or null for the default", () => {
    const at = (quantity: unknown) =>
      externalCredentialQuantitySchema.safeParse({
        festivalId: 1,
        externalParticipantId: 2,
        quantity,
        standCount: 1,
      });
    expect(at(null).success).toBe(true);
    expect(at(50).success).toBe(true);
    expect(firstMessage(at(51))).toBe("La cantidad puede ser como máximo 50.");
  });

  it("keeps null as the reset and refuses blank or nonnumeric input", () => {
    const at = (quantity: unknown) =>
      externalCredentialQuantitySchema.safeParse({
        festivalId: 1,
        externalParticipantId: 2,
        quantity,
        standCount: 1,
      });
    const reset = at(null);
    expect(reset.success && reset.data.quantity).toBeNull();
    const zero = at("0");
    expect(zero.success && zero.data.quantity).toBe(0);
    for (const bad of ["", " ", "abc", true]) {
      expect(firstMessage(at(bad))).toBe("La cantidad tiene que ser un número.");
    }
  });
});

describe("the Glitter team", () => {
  it("trims names and bounds their length", () => {
    expect(
      createStaffMemberSchema.parse({ festivalId: 1, fullName: "  Daniela  ", roleLabel: " Dirección " }),
    ).toEqual({ festivalId: 1, fullName: "Daniela", roleLabel: "Dirección", selectForFestival: true });
    expect(
      firstMessage(createStaffMemberSchema.safeParse({ festivalId: 1, fullName: "   ", roleLabel: "" })),
    ).toBe("Escribí el nombre.");
    expect(
      firstMessage(
        updateStaffMemberSchema.safeParse({
          festivalId: 1,
          staffMemberId: 2,
          fullName: "x".repeat(121),
          roleLabel: "",
        }),
      ),
    ).toBe("El nombre puede tener hasta 120 caracteres.");
    expect(
      firstMessage(
        createStaffMemberSchema.safeParse({ festivalId: 1, fullName: "Ana", roleLabel: "r".repeat(81) }),
      ),
    ).toBe("El rol puede tener hasta 80 caracteres.");
    expect(
      festivalStaffMemberSchema.safeParse({ festivalId: 1, staffMemberId: 2, selected: "yes" }).success,
    ).toBe(false);
  });
});

describe("one-off credentials", () => {
  it("takes a named person or a labelled lot", () => {
    expect(
      addExtraCredentialSchema.parse({
        festivalId: 1,
        extra: { kind: "named", name: "Marcelo", label: "Fotografía" },
      }).extra,
    ).toEqual({ kind: "named", name: "Marcelo", label: "Fotografía" });
    expect(
      addExtraCredentialSchema.parse({
        festivalId: 1,
        extra: { kind: "unnamed", label: "Prensa", quantity: "6" },
      }).extra,
    ).toEqual({ kind: "unnamed", label: "Prensa", quantity: 6 });
    expect(
      firstMessage(
        addExtraCredentialSchema.safeParse({
          festivalId: 1,
          extra: { kind: "unnamed", label: "Prensa", quantity: 0 },
        }),
      ),
    ).toBe("La cantidad tiene que ser al menos 1.");
    expect(
      firstMessage(
        addExtraCredentialSchema.safeParse({
          festivalId: 1,
          extra: { kind: "unnamed", label: "Prensa", quantity: "" },
        }),
      ),
    ).toBe("La cantidad tiene que ser un número.");
    expect(
      firstMessage(
        updateExtraCredentialSchema.safeParse({
          festivalId: 1,
          extraCredentialId: 3,
          label: "Prensa",
          quantity: " ",
        }),
      ),
    ).toBe("La cantidad tiene que ser un número.");
    expect(
      updateExtraCredentialSchema.parse({ festivalId: 1, extraCredentialId: 3, label: "Prensa" }),
    ).toEqual({ festivalId: 1, extraCredentialId: 3, label: "Prensa" });
    expect(
      firstMessage(
        addExtraCredentialSchema.safeParse({
          festivalId: 1,
          extra: { kind: "unnamed", label: "Prensa", quantity: 201 },
        }),
      ),
    ).toBe("La cantidad puede ser como máximo 200.");
    expect(
      updateExtraCredentialSchema.safeParse({ festivalId: 1, extraCredentialId: 3, label: "" }).success,
    ).toBe(false);
  });

  it("removes without confirming a printed entry unless told", () => {
    expect(removeExtraCredentialSchema.parse({ festivalId: "1", extraCredentialId: "3" })).toEqual({
      festivalId: 1,
      extraCredentialId: 3,
      confirmPrinted: false,
    });
    expect(
      removeExtraCredentialSchema.parse({ festivalId: 1, extraCredentialId: 3, confirmPrinted: true })
        .confirmPrinted,
    ).toBe(true);
    expect(
      removeExtraCredentialSchema.safeParse({
        festivalId: 1,
        extraCredentialId: 3,
        confirmPrinted: "true",
      }).success,
    ).toBe(false);
  });
});

describe("print batches", () => {
  it("takes known holders with the counts shown, once each, with an optional note", () => {
    const holder = (key: string) => ({
      key,
      group: "staff" as const,
      name: "Ana",
      note: null,
      standLabel: "A1",
      named: 1,
      unnamed: 0,
      reprint: false,
    });
    const press = { key: "extra:9", group: "staff" as const, name: "Prensa", note: "6 credenciales sin nombre", standLabel: null };
    expect(
      createPrintBatchSchema.parse({
        festivalId: 1,
        lastBatchId: null,
        holders: [holder("participant:4"), { ...press, named: 0, unnamed: "6", reprint: true }],
        note: "  ",
      }),
    ).toEqual({
      festivalId: 1,
      lastBatchId: null,
      holders: [holder("participant:4"), { ...press, named: 0, unnamed: 6, reprint: true }],
      note: null,
    });
    expect(
      createPrintBatchSchema.safeParse({ festivalId: 1, lastBatchId: 7, holders: [holder("staff:1")] }).success,
    ).toBe(true);
    // What the CSV showed is required too.
    expect(
      createPrintBatchSchema.safeParse({
        festivalId: 1,
        lastBatchId: null,
        holders: [{ ...holder("staff:1"), note: undefined }],
      }).success,
    ).toBe(false);
    // So is the group the CSV exported, and it must be a known one.
    expect(
      createPrintBatchSchema.safeParse({
        festivalId: 1,
        lastBatchId: null,
        holders: [{ ...holder("staff:1"), group: undefined }],
      }).success,
    ).toBe(false);
    expect(
      firstMessage(
        createPrintBatchSchema.safeParse({
          festivalId: 1,
          lastBatchId: null,
          holders: [{ ...holder("staff:1"), group: "artist" }],
        }),
      ),
    ).toBe("Una de las personas elegidas no es válida. Actualizá la página.");
    // The history version is required, so an old client cannot skip the check.
    expect(createPrintBatchSchema.safeParse({ festivalId: 1, holders: [holder("staff:1")] }).success).toBe(false);
    expect(
      firstMessage(createPrintBatchSchema.safeParse({ festivalId: 1, lastBatchId: null, holders: [] })),
    ).toBe("Elegí al menos una persona.");
    expect(
      firstMessage(
        createPrintBatchSchema.safeParse({ festivalId: 1, lastBatchId: null, holders: [holder("reservation:4")] }),
      ),
    ).toBe("Una de las personas elegidas no es válida. Actualizá la página.");
    expect(
      firstMessage(
        createPrintBatchSchema.safeParse({
          festivalId: 1,
          lastBatchId: null,
          holders: [holder("staff:1"), { ...holder("staff:1"), named: 2 }],
        }),
      ),
    ).toBe("Hay personas repetidas. Actualizá la página.");
    expect(
      createPrintBatchSchema.safeParse({
        festivalId: 1,
        lastBatchId: null,
        holders: [{ ...holder("staff:1"), named: -1 }],
      }).success,
    ).toBe(false);
    expect(
      createPrintBatchSchema.safeParse({ festivalId: 1, lastBatchId: null, holders: [{ key: "staff:1", named: 1, unnamed: 0 }] })
        .success,
    ).toBe(false);
    expect(
      firstMessage(
        createPrintBatchSchema.safeParse({
          festivalId: 1,
          lastBatchId: null,
          holders: [{ ...holder("staff:1"), name: "n".repeat(1001) }],
        }),
      ),
    ).toBe("Una de las personas elegidas no es válida. Actualizá la página.");
    expect(
      firstMessage(
        createPrintBatchSchema.safeParse({
          festivalId: 1,
          lastBatchId: null,
          holders: [holder("staff:1")],
          note: "n".repeat(201),
        }),
      ),
    ).toBe("La nota puede tener hasta 200 caracteres.");
    expect(printBatchRefSchema.safeParse({ festivalId: 1, batchId: -2 }).success).toBe(false);
  });
});
