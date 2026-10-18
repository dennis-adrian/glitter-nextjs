import { describe, expect, it } from "vitest";

import {
  buildDiscountCodeFormSchema,
  discountCodeFormDefaults,
  toDiscountCodeInput,
  type DiscountCodeFormValues,
} from "@/app/components/organisms/discount_codes/discount-code-form-schema";
import type { DiscountCodeWithRelations } from "@/app/lib/discount_codes/definitions";

const TODAY = "2026-10-18";

const ana = {
  id: 7,
  displayName: "Ana",
  firstName: null,
  lastName: null,
  email: "ana@example.test",
  imageUrl: null,
};

function values(
  overrides: Partial<DiscountCodeFormValues> = {},
): DiscountCodeFormValues {
  return {
    code: "VIP2026",
    discountUnit: "percentage",
    discountValue: "10",
    maxUses: "",
    festivalId: "",
    audience: "everyone",
    assignedUsers: [],
    expiresOn: "2026-11-01",
    isActive: true,
    ...overrides,
  };
}

function storedCode(
  overrides: Partial<DiscountCodeWithRelations> = {},
): DiscountCodeWithRelations {
  return {
    id: 3,
    code: "old code!",
    discountUnit: "amount",
    discountValue: 50,
    maxUses: 10,
    currentUses: 4,
    festivalId: null,
    audience: "selected_users",
    expiresAt: new Date("2026-09-01T03:59:59.999Z"),
    isActive: true,
    updatedAt: new Date(),
    createdAt: new Date(),
    festival: null,
    assignedUsers: [ana],
    ...overrides,
  };
}

function errorsFor(
  input: DiscountCodeFormValues,
  origin?: DiscountCodeWithRelations,
) {
  const result = buildDiscountCodeFormSchema(origin, TODAY).safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

describe("discount code form validation", () => {
  it("accepts a well-formed new code", () => {
    expect(errorsFor(values())).toEqual({});
  });

  it("refuses a percentage above 100", () => {
    expect(errorsFor(values({ discountValue: "150" }))).toHaveProperty(
      "discountValue",
    );
    expect(
      errorsFor(values({ discountUnit: "amount", discountValue: "150" })),
    ).toEqual({});
  });

  it("refuses zero, negative and over-precise amounts", () => {
    expect(errorsFor(values({ discountValue: "0" }))).toHaveProperty(
      "discountValue",
    );
    expect(errorsFor(values({ discountValue: "-5" }))).toHaveProperty(
      "discountValue",
    );
    expect(errorsFor(values({ discountValue: "9.999" }))).toHaveProperty(
      "discountValue",
    );
  });

  it("refuses a code too long for participants to apply", () => {
    expect(errorsFor(values({ code: "A".repeat(65) }))).toHaveProperty("code");
  });

  it("requires the code format on new codes", () => {
    expect(errorsFor(values({ code: "VIP 2026" }))).toHaveProperty("code");
  });

  it("lets a legacy code keep a name the format would refuse", () => {
    const origin = storedCode();
    const input = { ...discountCodeFormDefaults(origin) };
    expect(errorsFor(input, origin)).toEqual({});
    expect(errorsFor({ ...input, code: "other code!" }, origin)).toHaveProperty(
      "code",
    );
  });

  it("requires at least one user for a reserved code", () => {
    expect(errorsFor(values({ audience: "selected_users" }))).toHaveProperty(
      "assignedUsers",
    );
    expect(
      errorsFor(values({ audience: "selected_users", assignedUsers: [ana] })),
    ).toEqual({});
  });

  it("refuses a limit below the uses a code already has", () => {
    const origin = storedCode();
    const input = discountCodeFormDefaults(origin);
    expect(errorsFor({ ...input, maxUses: "3" }, origin)).toHaveProperty(
      "maxUses",
    );
    expect(errorsFor({ ...input, maxUses: "4" }, origin)).toEqual({});
    expect(errorsFor({ ...input, maxUses: "" }, origin)).toEqual({});
  });

  it("refuses a past date picked by hand, but keeps an expired code editable", () => {
    expect(errorsFor(values({ expiresOn: "2026-10-17" }))).toHaveProperty(
      "expiresOn",
    );
    expect(errorsFor(values({ expiresOn: TODAY }))).toEqual({});

    const expired = storedCode();
    const input = discountCodeFormDefaults(expired);
    expect(errorsFor({ ...input, isActive: false }, expired)).toEqual({});
    expect(
      errorsFor({ ...input, expiresOn: "2026-09-15" }, expired),
    ).toHaveProperty("expiresOn");
  });
});

describe("discount code form defaults", () => {
  it("keeps every input controlled with a string", () => {
    const defaults = discountCodeFormDefaults();
    expect(defaults.discountValue).toBe("");
    expect(defaults.maxUses).toBe("");
    expect(defaults.festivalId).toBe("");
    expect(defaults.expiresOn).toBe("");
  });

  it("shows a stored code the way an admin typed it", () => {
    const defaults = discountCodeFormDefaults(
      storedCode({ code: "vip", festivalId: 12 }),
    );
    expect(defaults.code).toBe("VIP");
    expect(defaults.festivalId).toBe("12");
    expect(defaults.discountValue).toBe("50");
    expect(defaults.maxUses).toBe("10");
    expect(defaults.expiresOn).toBe("2026-08-31");
    expect(defaults.assignedUsers).toEqual([ana]);
  });
});

describe("toDiscountCodeInput", () => {
  it("turns the inputs into the action's types", () => {
    expect(
      toDiscountCodeInput(
        values({ maxUses: "5", festivalId: "12", discountValue: "12.5" }),
      ),
    ).toMatchObject({
      code: "VIP2026",
      discountValue: 12.5,
      maxUses: 5,
      festivalId: 12,
      userIds: [],
      expiresAt: new Date("2026-11-02T03:59:59.999Z"),
    });
  });

  it("sends the chosen users only for a reserved code", () => {
    expect(
      toDiscountCodeInput(
        values({ audience: "selected_users", assignedUsers: [ana] }),
      ).userIds,
    ).toEqual([7]);
    // Switching back to everyone keeps the list in the form, but not in the
    // payload.
    expect(
      toDiscountCodeInput(
        values({ audience: "everyone", assignedUsers: [ana] }),
      ).userIds,
    ).toEqual([]);
  });

  it("sends an untouched expiry back exactly as stored", () => {
    const origin = storedCode({
      // Saved by the old form: UTC midnight, not the end of a La Paz day.
      expiresAt: new Date("2026-12-01T00:00:00Z"),
    });
    const input = discountCodeFormDefaults(origin);
    expect(toDiscountCodeInput(input, origin).expiresAt).toEqual(
      new Date("2026-12-01T00:00:00Z"),
    );
    expect(
      toDiscountCodeInput({ ...input, expiresOn: "2026-12-05" }, origin)
        .expiresAt,
    ).toEqual(new Date("2026-12-06T03:59:59.999Z"));
  });
});
