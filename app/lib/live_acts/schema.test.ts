// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildCulturalActivityStepSchema,
  CULTURAL_ACTIVITY_FIELD_STEPS,
  culturalActivitySchema,
} from "@/app/lib/live_acts/schema";

const DESCRIPTION = "Una actividad para toda la comunidad del festival.";

function valid(overrides: Record<string, unknown> = {}) {
  return {
    category: "music",
    otherType: "",
    actName: "Glitter Duo",
    description: "",
    resourceLink: "https://youtube.com/watch?v=1",
    socialLinks: [],
    workshopCapacity: "",
    spaceNeeds: "",
    relatedOffer: "",
    noCostAcknowledged: false,
    contactName: "María Pérez",
    contactEmail: " Maria@Example.com ",
    contactPhone: "+59171234567",
    website: "",
    ...overrides,
  };
}

function messages(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [
      issue.path.join("."),
      issue.message,
    ]),
  );
}

describe("culturalActivitySchema", () => {
  it("accepts music without a description and normalizes the contact", () => {
    const result = culturalActivitySchema.safeParse(valid());
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      category: "music",
      description: null,
      contactEmail: "maria@example.com",
      socialLinks: [],
    });
  });

  it("requires a category", () => {
    const result = culturalActivitySchema.safeParse(valid({ category: "" }));
    expect(result.success).toBe(false);
    expect(messages(result).category).toBe("Seleccioná un tipo de actividad");
  });

  it.each(["dance", "talk", "workshop", "other"])(
    "requires a 20-character description for %s",
    (category) => {
      const result = culturalActivitySchema.safeParse(
        valid({ category, description: "corta" }),
      );
      expect(messages(result).description).toBe(
        "La descripción debe tener al menos 20 caracteres",
      );
    },
  );

  it("requires the free-text type for other activities", () => {
    const missing = culturalActivitySchema.safeParse(
      valid({ category: "other", description: DESCRIPTION, otherType: " " }),
    );
    expect(messages(missing).otherType).toBe(
      "Contanos qué tipo de actividad es",
    );
    const long = culturalActivitySchema.safeParse(
      valid({
        category: "other",
        description: DESCRIPTION,
        otherType: "x".repeat(81),
      }),
    );
    expect(long.success).toBe(false);

    const ok = culturalActivitySchema.safeParse(
      valid({
        category: "other",
        description: DESCRIPTION,
        otherType: " Feria de fanzines ",
        spaceNeeds: "Mesas",
      }),
    );
    expect(ok.data).toMatchObject({
      otherType: "Feria de fanzines",
      spaceNeeds: "Mesas",
    });
  });

  it("requires a capacity and the no-cost acknowledgement for workshops", () => {
    const result = culturalActivitySchema.safeParse(
      valid({ category: "workshop", description: DESCRIPTION }),
    );
    expect(messages(result)).toMatchObject({
      workshopCapacity: "Ingresá cuántas personas pueden participar",
      noCostAcknowledged:
        "Tenés que aceptar que el taller no tenga costo para quienes participan",
    });

    for (const workshopCapacity of ["0", "501", "2.5", "abc"]) {
      const bad = culturalActivitySchema.safeParse(
        valid({
          category: "workshop",
          description: DESCRIPTION,
          workshopCapacity,
          noCostAcknowledged: true,
        }),
      );
      expect(messages(bad).workshopCapacity).toBeDefined();
    }

    const ok = culturalActivitySchema.safeParse(
      valid({
        category: "workshop",
        description: DESCRIPTION,
        workshopCapacity: "20",
        noCostAcknowledged: true,
        relatedOffer: "Curso completo",
        spaceNeeds: "",
      }),
    );
    expect(ok.success).toBe(true);
    expect(ok.data).toMatchObject({
      workshopCapacity: 20,
      relatedOffer: "Curso completo",
      spaceNeeds: null,
      noCostAcknowledged: true,
    });
  });

  it("drops fields that do not apply to the category", () => {
    const result = culturalActivitySchema.safeParse(
      valid({
        workshopCapacity: "30",
        noCostAcknowledged: true,
        relatedOffer: "Curso",
        spaceNeeds: "Proyector",
        otherType: "Algo",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("workshopCapacity");
    expect(result.data).not.toHaveProperty("relatedOffer");
    expect(result.data).not.toHaveProperty("spaceNeeds");
    expect(result.data).not.toHaveProperty("otherType");
    expect(result.data).not.toHaveProperty("noCostAcknowledged");
  });

  it("only allows http(s) links, at most five social links", () => {
    expect(
      messages(
        culturalActivitySchema.safeParse(
          valid({ resourceLink: "javascript:alert(1)" }),
        ),
      ).resourceLink,
    ).toBe("Ingresá un enlace válido");
    expect(
      culturalActivitySchema.safeParse(valid({ socialLinks: ["@glitter"] }))
        .success,
    ).toBe(false);
    expect(
      culturalActivitySchema.safeParse(
        valid({ socialLinks: Array(6).fill("https://instagram.com/x") }),
      ).success,
    ).toBe(false);
    const blanks = culturalActivitySchema.safeParse(
      valid({ socialLinks: [" ", "https://instagram.com/x "] }),
    );
    expect(blanks.data?.socialLinks).toEqual(["https://instagram.com/x"]);
  });

  it("checks the contact fields", () => {
    const result = culturalActivitySchema.safeParse(
      valid({ contactEmail: "no", contactPhone: "123", contactName: "" }),
    );
    expect(messages(result)).toMatchObject({
      contactEmail: "Ingresá un correo válido, por ejemplo nombre@gmail.com.",
    });
    expect(messages(result).contactPhone).toBeDefined();
    expect(messages(result).contactName).toBeDefined();
  });
});

describe("buildCulturalActivityStepSchema", () => {
  it("step 1 checks the category and the other type only", () => {
    const schema = buildCulturalActivityStepSchema("tipo", null);
    expect(schema.safeParse({ category: "talk" }).success).toBe(true);
    expect(messages(schema.safeParse({ category: "" })).category).toBeDefined();
    expect(
      messages(schema.safeParse({ category: "other", otherType: "" }))
        .otherType,
    ).toBe("Contanos qué tipo de actividad es");
  });

  it("step 2 follows the category", () => {
    const music = buildCulturalActivityStepSchema("actividad", "music");
    expect(music.safeParse(valid()).success).toBe(true);
    const workshop = buildCulturalActivityStepSchema("actividad", "workshop");
    expect(
      Object.keys(
        messages(workshop.safeParse(valid({ description: DESCRIPTION }))),
      ).sort(),
    ).toEqual(["noCostAcknowledged", "workshopCapacity"]);
    const none = buildCulturalActivityStepSchema("actividad", null);
    expect(none.safeParse(valid({ category: "" })).success).toBe(false);
  });

  it("step 3 checks the contact", () => {
    const schema = buildCulturalActivityStepSchema("contacto", "music");
    expect(schema.safeParse(valid()).success).toBe(true);
  });

  it("maps every field to its step", () => {
    expect(CULTURAL_ACTIVITY_FIELD_STEPS.get("otherType")).toBe(0);
    expect(CULTURAL_ACTIVITY_FIELD_STEPS.get("workshopCapacity")).toBe(1);
    expect(CULTURAL_ACTIVITY_FIELD_STEPS.get("noCostAcknowledged")).toBe(1);
    expect(CULTURAL_ACTIVITY_FIELD_STEPS.get("contactPhone")).toBe(2);
  });
});
