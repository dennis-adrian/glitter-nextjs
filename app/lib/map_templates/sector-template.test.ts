import { describe, expect, it } from "vitest";

import { festivalExportSchema } from "@/app/lib/festival_exports/schemas";
import { sectorTemplateSchema } from "@/app/lib/map_templates/schemas";
import {
  buildSectorTemplate,
  type ExportableSector,
  type ExportableStand,
  standValuesFromTemplate,
  subcategoryKey,
} from "@/app/lib/map_templates/sector-template";

const now = new Date("2026-01-01T00:00:00.000Z");

function stand(
  id: number,
  overrides: Partial<ExportableStand> = {},
): ExportableStand {
  return {
    id,
    label: "E",
    status: "available",
    orientation: "landscape",
    standNumber: id,
    standCategory: "illustration",
    zone: "main",
    width: null,
    height: null,
    positionLeft: id * 10,
    positionTop: 0,
    price: 350,
    individualPrice: 350,
    sharedPrice: 450,
    participationType: "standard",
    festivalId: 1,
    festivalSectorId: 1,
    qrCodeId: null,
    standGroupId: null,
    updatedAt: now,
    createdAt: now,
    standGroup: null,
    standSubcategories: [],
    ...overrides,
  };
}

function sector(stands: ExportableStand[]): ExportableSector {
  return {
    id: 1,
    name: "Planta baja",
    description: null,
    festivalId: 1,
    orderInFestival: 1,
    mapOriginX: 0,
    mapOriginY: 0,
    mapWidth: 100,
    mapHeight: 100,
    updatedAt: now,
    createdAt: now,
    stands,
    mapElements: [],
  } as ExportableSector;
}

const fullTable = { id: 70, type: "full_table" as const, fullTablePrice: 650 };

describe("buildSectorTemplate", () => {
  it("carries individual and shared prices, participation and subcategories", () => {
    const template = buildSectorTemplate(
      sector([
        stand(1, {
          participationType: "live_activity",
          standSubcategories: [
            { subcategory: { label: "Cómic", category: "illustration" } },
          ],
        }),
      ]),
    );

    expect(template.stands[0]).toMatchObject({
      price: 350,
      individualPrice: 350,
      sharedPrice: 450,
      participationType: "live_activity",
      subcategories: [{ category: "illustration", label: "Cómic" }],
    });
  });

  it("exports a full table by the positions of its two halves, with its price", () => {
    const template = buildSectorTemplate(
      sector([
        stand(3),
        stand(2, { standGroupId: 70, standGroup: fullTable }),
        stand(1, { standGroupId: 70, standGroup: fullTable }),
      ]),
    );

    // Ordered by id, so the halves are positions 0 and 1.
    expect(template.stands.map((s) => s.standNumber)).toEqual([1, 2, 3]);
    expect(template.groups).toEqual([
      { type: "full_table", fullTablePrice: 650, standIndexes: [0, 1] },
    ]);
    expect(sectorTemplateSchema.safeParse(template).success).toBe(true);
  });

  it("keeps visual groups without a table price", () => {
    const visual = { id: 5, type: "visual_group" as const, fullTablePrice: 99 };
    const template = buildSectorTemplate(
      sector([
        stand(1, { standGroup: visual }),
        stand(2, { standGroup: visual }),
        stand(3, { standGroup: visual }),
      ]),
    );

    expect(template.groups).toEqual([
      { type: "visual_group", fullTablePrice: null, standIndexes: [0, 1, 2] },
    ]);
  });

  it("drops a full table that lost a half instead of writing an unimportable file", () => {
    const template = buildSectorTemplate(
      sector([stand(1, { standGroup: fullTable }), stand(2)]),
    );

    expect(template.groups).toBeUndefined();
    expect(sectorTemplateSchema.safeParse(template).success).toBe(true);
  });
});

describe("standValuesFromTemplate", () => {
  it("reads a pre-split file's single price as the individual price", () => {
    const values = standValuesFromTemplate({
      label: null,
      standNumber: 1,
      standCategory: "gastronomy",
      zone: "main",
      orientation: "portrait",
      width: null,
      height: null,
      positionLeft: 0,
      positionTop: 0,
      price: 200,
    });

    expect(values).toMatchObject({
      price: 200,
      individualPrice: 200,
      sharedPrice: null,
      participationType: "standard",
      status: "available",
    });
  });
});

describe("subcategoryKey", () => {
  it("ignores case and surrounding space in the label", () => {
    expect(subcategoryKey("illustration", " Cómic ")).toBe(
      subcategoryKey("illustration", "cómic"),
    );
  });
});

describe("sectorTemplateSchema", () => {
  const base = {
    name: "S",
    description: null,
    orderInFestival: 1,
    mapBounds: { originX: null, originY: null, width: null, height: null },
    stands: [1, 2, 3].map((n) => ({
      label: null,
      standNumber: n,
      standCategory: "illustration" as const,
      zone: "main" as const,
      orientation: "landscape" as const,
      width: null,
      height: null,
      positionLeft: 0,
      positionTop: 0,
      price: 100,
    })),
  };

  it("refuses a full table that is not exactly two stands", () => {
    expect(
      sectorTemplateSchema.safeParse({
        ...base,
        groups: [
          { type: "full_table", fullTablePrice: 1, standIndexes: [0, 1, 2] },
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses a group pointing past the stand list or reusing a stand", () => {
    expect(
      sectorTemplateSchema.safeParse({
        ...base,
        groups: [
          { type: "full_table", fullTablePrice: 1, standIndexes: [2, 3] },
        ],
      }).success,
    ).toBe(false);
    expect(
      sectorTemplateSchema.safeParse({
        ...base,
        groups: [
          { type: "full_table", fullTablePrice: 1, standIndexes: [0, 1] },
          { type: "visual_group", fullTablePrice: null, standIndexes: [1, 2] },
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses a shared price below the individual price", () => {
    expect(
      sectorTemplateSchema.safeParse({
        ...base,
        stands: [{ ...base.stands[0], individualPrice: 100, sharedPrice: 90 }],
      }).success,
    ).toBe(false);
  });
});

describe("festivalExportSchema", () => {
  const info = {
    name: "F",
    description: null,
    address: null,
    locationLabel: null,
    locationUrl: null,
    festivalType: "glitter",
    mapsVersion: "v3",
    publicRegistration: false,
    eventDayRegistration: false,
    festivalCode: null,
    dates: [],
  };
  const file = (festival: object) => ({
    version: "2.1",
    metadata: { name: "F", createdAt: now.toISOString() },
    festival,
  });

  it("still reads a 2.0 file without the newer fields", () => {
    expect(
      festivalExportSchema.safeParse({ ...file(info), version: "2.0" }).success,
    ).toBe(true);
  });

  it("accepts reservation features scoped like the table", () => {
    expect(
      festivalExportSchema.safeParse(
        file({
          ...info,
          reservationHoldMinutes: 10,
          reservationFeatures: [
            {
              type: "full_table",
              category: "illustration",
              enabled: true,
              creditPrice: 5,
              deadlineOverrideAt: null,
            },
            {
              type: "late_partner",
              category: null,
              enabled: false,
              creditPrice: 2,
              deadlineOverrideAt: now.toISOString(),
            },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("refuses a feature scope the table would refuse", () => {
    const feature = {
      type: "full_table",
      category: null,
      enabled: true,
      creditPrice: 5,
      deadlineOverrideAt: null,
    };
    expect(
      festivalExportSchema.safeParse(
        file({ ...info, reservationFeatures: [feature] }),
      ).success,
    ).toBe(false);
    expect(
      festivalExportSchema.safeParse(
        file({
          ...info,
          reservationFeatures: [
            {
              ...feature,
              type: "reservation_release",
              deadlineOverrideAt: now.toISOString(),
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});
