// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildVolunteerApplicationSchema,
  buildVolunteerSectionSchema,
  VOLUNTEER_FORM_SECTIONS,
  isOldEnoughOn,
  isVolunteerCallOpen,
  volunteerAgeCutoffDate,
  type VolunteerSchemaContext,
} from "@/app/lib/volunteers/schema";

/** 15:00 on 18 Dec 2026 in La Paz (UTC-4) — v11's setup shift. */
const SETUP_SHIFT_START = new Date("2026-12-18T19:00:00Z");
const CLOSES_AT = new Date("2026-12-01T03:59:00Z"); // 30 Nov 23:59 La Paz

function context(
  overrides: Partial<VolunteerSchemaContext> = {},
): VolunteerSchemaContext {
  return {
    roleIds: [11, 12, 13],
    shiftIds: [21, 22, 23],
    ageCutoffDate: "2026-12-18",
    applicationsCloseAt: CLOSES_AT,
    now: () => new Date("2026-11-20T12:00:00Z"),
    ...overrides,
  };
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Camila Rojas",
    birthdate: "2000-05-10",
    phone: "+59171234567",
    email: "  Camila.Rojas@Example.COM ",
    zone: "",
    shiftIds: [21, 22],
    firstChoiceRoleId: "11",
    secondChoiceRoleId: "12",
    experience: ["events"],
    experienceNotes: "",
    portfolio: "",
    motivation: "Me encanta la ilustración y quiero ayudar.",
    emergencyContactName: "Ana Rojas",
    emergencyContactPhone: "+59160123456",
    referralSource: "instagram",
    commitmentConsent: true,
    imageConsent: true,
    dataConsent: true,
    website: "",
    ...overrides,
  };
}

function messages(result: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) {
  return result.success
    ? []
    : result.error!.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
}

describe("volunteerAgeCutoffDate", () => {
  it("is the La Paz date of the earliest active shift", () => {
    expect(
      volunteerAgeCutoffDate([
        { startsAt: new Date("2026-12-19T14:00:00Z") },
        { startsAt: SETUP_SHIFT_START },
        { startsAt: new Date("2026-12-20T17:30:00Z") },
      ]),
    ).toBe("2026-12-18");
  });

  it("ignores inactive shifts", () => {
    expect(
      volunteerAgeCutoffDate([
        { startsAt: SETUP_SHIFT_START, isActive: false },
        { startsAt: new Date("2026-12-19T14:00:00Z"), isActive: true },
      ]),
    ).toBe("2026-12-19");
  });

  it("uses La Paz's day, not UTC's, near midnight", () => {
    // 01:30 UTC on the 19th is still 21:30 on the 18th in La Paz.
    expect(
      volunteerAgeCutoffDate([{ startsAt: new Date("2026-12-19T01:30:00Z") }]),
    ).toBe("2026-12-18");
  });

  it("is null without active shifts", () => {
    expect(volunteerAgeCutoffDate([])).toBeNull();
    expect(
      volunteerAgeCutoffDate([
        { startsAt: SETUP_SHIFT_START, isActive: false },
      ]),
    ).toBeNull();
  });
});

describe("isOldEnoughOn", () => {
  it("accepts someone who turns 18 on the cutoff day", () => {
    expect(isOldEnoughOn("2008-12-18", "2026-12-18")).toBe(true);
  });

  it("rejects someone who turns 18 the day after", () => {
    expect(isOldEnoughOn("2008-12-19", "2026-12-18")).toBe(false);
  });

  it("rejects an invalid date", () => {
    expect(isOldEnoughOn("2008-02-30", "2026-12-18")).toBe(false);
  });
});

describe("isVolunteerCallOpen", () => {
  it("is open up to and including the closing instant", () => {
    expect(
      isVolunteerCallOpen(CLOSES_AT, new Date("2026-12-01T03:58:59Z")),
    ).toBe(true);
    expect(isVolunteerCallOpen(CLOSES_AT, CLOSES_AT)).toBe(true);
  });

  it("is closed after it", () => {
    expect(
      isVolunteerCallOpen(CLOSES_AT, new Date("2026-12-01T03:59:01Z")),
    ).toBe(false);
  });
});

describe("buildVolunteerApplicationSchema", () => {
  it("accepts a complete application and normalizes it", () => {
    const result =
      buildVolunteerApplicationSchema(context()).safeParse(validInput());
    expect(messages(result)).toEqual([]);
    expect(result.data).toMatchObject({
      email: "camila.rojas@example.com",
      firstChoiceRoleId: 11,
      secondChoiceRoleId: 12,
      shiftIds: [21, 22],
      zone: null,
      portfolio: null,
    });
  });

  describe("age, from the earliest active shift", () => {
    it("accepts an applicant who is 18 on the setup day", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ birthdate: "2008-12-18" }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects an applicant who turns 18 on the first festival day instead", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ birthdate: "2008-12-19" }),
      );
      expect(messages(result)).toEqual([
        {
          path: "birthdate",
          message: "Tenés que ser mayor de 18 años al 18 de diciembre de 2026.",
        },
      ]);
    });

    it("moves with the cutoff when the setup shift is deactivated", () => {
      const ageCutoffDate = volunteerAgeCutoffDate([
        { startsAt: SETUP_SHIFT_START, isActive: false },
        { startsAt: new Date("2026-12-19T14:00:00Z") },
      ])!;
      const result = buildVolunteerApplicationSchema(
        context({ ageCutoffDate }),
      ).safeParse(validInput({ birthdate: "2008-12-19" }));
      expect(result.success).toBe(true);
    });
  });

  describe("roles", () => {
    it("requires two different roles", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ firstChoiceRoleId: "12", secondChoiceRoleId: "12" }),
      );
      expect(messages(result)).toEqual([
        {
          path: "secondChoiceRoleId",
          message: "Elegí un rol distinto al de tu 1ª opción.",
        },
      ]);
    });

    it("requires both choices", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ secondChoiceRoleId: "" }),
      );
      expect(messages(result).map((issue) => issue.path)).toContain(
        "secondChoiceRoleId",
      );
    });

    it("rejects a role outside the festival's active roles", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ secondChoiceRoleId: "99" }),
      );
      expect(messages(result).map((issue) => issue.path)).toEqual([
        "secondChoiceRoleId",
      ]);
    });
  });

  describe("shifts", () => {
    it("requires at least one", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ shiftIds: [] }),
      );
      expect(messages(result)).toEqual([
        { path: "shiftIds", message: "Elegí al menos un turno." },
      ]);
    });

    it("has no maximum and allows overlapping shifts", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ shiftIds: [21, 22, 23] }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects a shift outside the festival's active shifts", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ shiftIds: [21, 404] }),
      );
      expect(messages(result).map((issue) => issue.path)).toEqual(["shiftIds"]);
    });
  });

  describe("phones", () => {
    it.each(["+59151234567", "+59159876543", "+591 5123 4567"])(
      "accepts the new Bolivian mobiles starting with 5 (%s)",
      (phone) => {
        const result = buildVolunteerApplicationSchema(context()).safeParse(
          validInput({ phone, emergencyContactPhone: phone }),
        );
        expect(messages(result)).toEqual([]);
      },
    );

    it("rejects an incomplete number, including the bare dial code", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ phone: "+591", emergencyContactPhone: "+5915123" }),
      );
      expect(messages(result).map((issue) => issue.path)).toEqual([
        "phone",
        "emergencyContactPhone",
      ]);
    });
  });

  describe("closing date", () => {
    it("accepts an application just before closing", () => {
      const result = buildVolunteerApplicationSchema(
        context({ now: () => new Date("2026-12-01T03:58:00Z") }),
      ).safeParse(validInput());
      expect(result.success).toBe(true);
    });

    it("rejects an application after closing", () => {
      const result = buildVolunteerApplicationSchema(
        context({ now: () => new Date("2026-12-01T04:00:00Z") }),
      ).safeParse(validInput());
      expect(messages(result)).toEqual([
        { path: "root", message: "Convocatoria cerrada" },
      ]);
    });
  });

  it("requires the two commitments", () => {
    const result = buildVolunteerApplicationSchema(context()).safeParse(
      validInput({ commitmentConsent: false, dataConsent: false }),
    );
    expect(messages(result)).toEqual([
      {
        path: "commitmentConsent",
        message: "Tenés que aceptar los dos compromisos para postular.",
      },
      {
        path: "dataConsent",
        message: "Tenés que aceptar los dos compromisos para postular.",
      },
    ]);
  });

  it("treats the image authorization as an optional preference", () => {
    const schema = buildVolunteerApplicationSchema(context());
    const declined = schema.safeParse(validInput({ imageConsent: false }));
    const omitted = schema.safeParse(validInput({ imageConsent: undefined }));
    const given = schema.safeParse(validInput({ imageConsent: true }));
    expect(declined.data?.imageConsent).toBe(false);
    expect(omitted.data?.imageConsent).toBe(false);
    expect(given.data?.imageConsent).toBe(true);
  });

  describe("sections, for a step-by-step form", () => {
    it("cover every field of the full schema exactly once", () => {
      const fields = VOLUNTEER_FORM_SECTIONS.flatMap((section) =>
        Object.keys(buildVolunteerSectionSchema(context(), section).shape),
      );
      expect(new Set(fields).size).toBe(fields.length);
      expect(fields.sort()).toEqual(Object.keys(validInput()).sort());
    });

    it("validate one step on its own, cross-field checks included", () => {
      const step = buildVolunteerSectionSchema(context(), "shiftsAndRoles");
      expect(
        step.safeParse({
          shiftIds: [21],
          firstChoiceRoleId: "11",
          secondChoiceRoleId: "12",
        }).success,
      ).toBe(true);
      expect(
        messages(
          step.safeParse({
            shiftIds: [21],
            firstChoiceRoleId: "11",
            secondChoiceRoleId: "11",
          }),
        ).map((issue) => issue.path),
      ).toEqual(["secondChoiceRoleId"]);
    });
  });

  describe("portfolio", () => {
    it.each([
      "https://instagram.com/camila.dibuja",
      "https://www.behance.net/camila",
      "http://camila.com",
    ])("accepts a full link (%s)", (portfolio) => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ portfolio }),
      );
      expect(result.data?.portfolio).toBe(portfolio);
    });

    it.each([
      "@camila.dibuja",
      "instagram.com/camila",
      "ftp://camila.com",
      "https://localhost",
    ])("asks for the full link instead of %s", (portfolio) => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ portfolio }),
      );
      expect(messages(result)).toEqual([
        {
          path: "portfolio",
          message:
            "Pegá el enlace completo, empezando con https:// (por ejemplo, https://instagram.com/tuusuario).",
        },
      ]);
    });

    it("stays optional", () => {
      const result = buildVolunteerApplicationSchema(context()).safeParse(
        validInput({ portfolio: "  " }),
      );
      expect(result.data?.portfolio).toBeNull();
    });
  });

  it("asks for at least 30 characters of motivation, not counting edge spaces", () => {
    const schema = buildVolunteerApplicationSchema(context());
    expect(
      schema.safeParse(validInput({ motivation: "a".repeat(30) })).success,
    ).toBe(true);
    expect(
      messages(
        schema.safeParse(validInput({ motivation: `  ${"a".repeat(29)}   ` })),
      ),
    ).toEqual([
      {
        path: "motivation",
        message: "Contanos un poco más: escribí al menos 30 caracteres.",
      },
    ]);
    expect(messages(schema.safeParse(validInput({ motivation: "" })))).toEqual([
      {
        path: "motivation",
        message: "Contanos en pocas palabras por qué querés sumarte.",
      },
    ]);
  });

  it("caps the motivation at 500 characters", () => {
    const schema = buildVolunteerApplicationSchema(context());
    expect(
      schema.safeParse(validInput({ motivation: "a".repeat(500) })).success,
    ).toBe(true);
    expect(
      messages(schema.safeParse(validInput({ motivation: "a".repeat(501) }))),
    ).toEqual([{ path: "motivation", message: "Es demasiado largo" }]);
  });
});
