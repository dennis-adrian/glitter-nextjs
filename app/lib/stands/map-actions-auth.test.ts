// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileMock = vi.hoisted(() => vi.fn());
const dbTouched = vi.hoisted(() => ({ count: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: profileMock,
  requireAdminOrFestivalAdmin: async () => {
    const profile = await profileMock();
    return profile &&
      (profile.role === "admin" || profile.role === "festival_admin")
      ? profile
      : null;
  },
}));
// Any database access at all fails the test: a refused caller must be turned
// away before the first query.
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        dbTouched.count += 1;
        throw new Error("database touched");
      },
    },
  ),
}));

import {
  createStands,
  deleteStands,
  updateStand,
  updateStandPositions,
} from "@/app/api/stands/actions";
import { updateSectorMapBounds } from "@/app/lib/festival_sectors/actions";
import {
  createMapElement,
  deleteMapElements,
  updateMapElement,
  updateMapElementPositions,
} from "@/app/lib/map_elements/actions";
import {
  deleteMapTemplate,
  exportFestivalMapAsTemplate,
  exportSectorAsTemplate,
  fetchMapTemplateById,
  fetchMapTemplates,
  importTemplateToFestival,
  saveMapTemplate,
  updateMapTemplate,
} from "@/app/lib/map_templates/actions";
import type { MapTemplate } from "@/app/lib/map_templates/definitions";
import {
  addStandSubcategory,
  removeStandSubcategory,
  setStandSubcategoriesBulk,
} from "@/app/lib/stands/subcategory-actions";

// Valid inputs throughout, so an action missing its guard would get past
// validation and reach the database instead of failing for another reason.
const template: MapTemplate = {
  version: "1.1",
  metadata: { name: "Plano", createdAt: "2026-10-03T00:00:00.000Z" },
  sectors: [
    {
      name: "A",
      description: null,
      orderInFestival: 1,
      mapBounds: { originX: null, originY: null, width: null, height: null },
      stands: [],
    },
  ],
};
const position = [{ id: 1, positionLeft: 10, positionTop: 10 }];

const ACTIONS: [string, () => Promise<unknown>][] = [
  ["updateStandPositions", () => updateStandPositions(position)],
  [
    "createStands",
    () =>
      createStands({
        sectorId: 1,
        festivalId: 1,
        label: "A",
        count: 1,
        startNumber: 1,
        status: "disabled",
      }),
  ],
  [
    "updateStand",
    () =>
      updateStand({ id: 1, label: "A", standNumber: 1, status: "available" }),
  ],
  ["deleteStands", () => deleteStands([1])],
  [
    "updateSectorMapBounds",
    () => updateSectorMapBounds(1, { minX: 0, minY: 0, width: 10, height: 10 }),
  ],
  [
    "createMapElement",
    () =>
      createMapElement({
        festivalSectorId: 1,
        type: "entrance",
        positionLeft: 0,
        positionTop: 0,
        width: 10,
        height: 10,
      }),
  ],
  ["updateMapElementPositions", () => updateMapElementPositions(position)],
  [
    "updateMapElement",
    () => updateMapElement({ id: 1 } as Parameters<typeof updateMapElement>[0]),
  ],
  ["deleteMapElements", () => deleteMapElements([1])],
  ["exportFestivalMapAsTemplate", () => exportFestivalMapAsTemplate(1)],
  ["exportSectorAsTemplate", () => exportSectorAsTemplate(1)],
  ["saveMapTemplate", () => saveMapTemplate(template, 1)],
  ["deleteMapTemplate", () => deleteMapTemplate(1)],
  [
    "importTemplateToFestival",
    () => importTemplateToFestival(1, template, { mode: "create_only" }),
  ],
  ["updateMapTemplate", () => updateMapTemplate(1, { name: "x" })],
  ["addStandSubcategory", () => addStandSubcategory(1, 1, 1)],
  ["removeStandSubcategory", () => removeStandSubcategory(1, 1, 1)],
  ["setStandSubcategoriesBulk", () => setStandSubcategoriesBulk([1], [1], 1)],
];

describe.each([
  ["a signed-out visitor", null],
  ["a participant", { id: 5, role: "user" }],
])("stand and map actions called by %s", (_, profile) => {
  beforeEach(() => {
    profileMock.mockReset();
    profileMock.mockResolvedValue(profile);
    dbTouched.count = 0;
  });

  it.each(ACTIONS)("%s is refused before any query", async (_name, call) => {
    const result = await call();

    expect(result).toMatchObject({ success: false });
    expect(dbTouched.count).toBe(0);
  });

  it("returns no templates", async () => {
    expect(await fetchMapTemplates()).toEqual([]);
    expect(await fetchMapTemplateById(1)).toBeNull();
    expect(dbTouched.count).toBe(0);
  });
});
