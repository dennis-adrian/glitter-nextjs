import { describe, expect, it } from "vitest";

import { DEFAULT_CREDENTIAL_RULES } from "@/app/lib/credentials/definitions";
import {
  addExtraCredentialSchema,
  createPrintBatchSchema,
  createStaffMemberSchema,
  externalCredentialQuantitySchema,
  festivalStaffMemberSchema,
  printBatchRefSchema,
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
      });
    expect(at(0).success).toBe(true);
    expect(at(20).success).toBe(true);
    expect(firstMessage(at(21))).toBe("La cantidad puede ser como máximo 20.");
    expect(firstMessage(at(-1))).toBe("La cantidad no puede ser negativa.");
    expect(firstMessage(at(1.5))).toBe("La cantidad tiene que ser un número entero.");
  });

  it("refuses an unknown naming mode and a bad festival id", () => {
    expect(
      firstMessage(
        saveCredentialRulesSchema.safeParse({
          festivalId: 1,
          rules: { ...rules, gastronomy: { quantity: 2, namingMode: "half" } },
        }),
      ),
    ).toBe("Elegí cuáles llevan nombre.");
    expect(saveCredentialRulesSchema.safeParse({ festivalId: 0, rules }).success).toBe(false);
    expect(
      saveCredentialRulesSchema.safeParse({ festivalId: 2_147_483_648, rules }).success,
    ).toBe(false);
  });
});

describe("externalCredentialQuantitySchema", () => {
  it("takes 0 to 50, or null for the default", () => {
    const at = (quantity: unknown) =>
      externalCredentialQuantitySchema.safeParse({ festivalId: 1, externalParticipantId: 2, quantity });
    expect(at(null).success).toBe(true);
    expect(at(50).success).toBe(true);
    expect(firstMessage(at(51))).toBe("La cantidad puede ser como máximo 50.");
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
          extra: { kind: "unnamed", label: "Prensa", quantity: 201 },
        }),
      ),
    ).toBe("La cantidad puede ser como máximo 200.");
    expect(
      updateExtraCredentialSchema.safeParse({ festivalId: 1, extraCredentialId: 3, label: "" }).success,
    ).toBe(false);
  });
});

describe("print batches", () => {
  it("takes known holders with the counts shown, once each, with an optional note", () => {
    const holder = (key: string) => ({ key, named: 1, unnamed: 0, reprint: false });
    expect(
      createPrintBatchSchema.parse({
        festivalId: 1,
        holders: [holder("participant:4"), { key: "extra:9", named: 0, unnamed: "6", reprint: true }],
        note: "  ",
      }),
    ).toEqual({
      festivalId: 1,
      holders: [holder("participant:4"), { key: "extra:9", named: 0, unnamed: 6, reprint: true }],
      note: null,
    });
    expect(
      firstMessage(createPrintBatchSchema.safeParse({ festivalId: 1, holders: [] })),
    ).toBe("Elegí al menos una persona.");
    expect(
      firstMessage(
        createPrintBatchSchema.safeParse({ festivalId: 1, holders: [holder("reservation:4")] }),
      ),
    ).toBe("Una de las personas elegidas no es válida. Actualizá la página.");
    expect(
      firstMessage(
        createPrintBatchSchema.safeParse({
          festivalId: 1,
          holders: [holder("staff:1"), { ...holder("staff:1"), named: 2 }],
        }),
      ),
    ).toBe("Hay personas repetidas. Actualizá la página.");
    expect(
      createPrintBatchSchema.safeParse({
        festivalId: 1,
        holders: [{ ...holder("staff:1"), named: -1 }],
      }).success,
    ).toBe(false);
    expect(
      createPrintBatchSchema.safeParse({ festivalId: 1, holders: [{ key: "staff:1", named: 1, unnamed: 0 }] })
        .success,
    ).toBe(false);
    expect(
      firstMessage(
        createPrintBatchSchema.safeParse({
          festivalId: 1,
          holders: [holder("staff:1")],
          note: "n".repeat(201),
        }),
      ),
    ).toBe("La nota puede tener hasta 200 caracteres.");
    expect(printBatchRefSchema.safeParse({ festivalId: 1, batchId: -2 }).success).toBe(false);
  });
});
