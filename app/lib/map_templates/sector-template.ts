import type {
  MapElementTemplate,
  SectorTemplate,
  StandGroupTemplate,
  StandTemplate,
} from "@/app/lib/map_templates/definitions";
import type {
  festivalSectors,
  mapElements,
  standGroups,
  stands,
  subcategories,
} from "@/db/schema";

/**
 * The stand relations `buildSectorTemplate` reads. Pass it as the `with` of a
 * sector's `stands` so every exporter loads the same facts.
 */
export const SECTOR_TEMPLATE_STAND_RELATIONS = {
  standGroup: true,
  standSubcategories: { with: { subcategory: true } },
} as const;

export type ExportableStand = typeof stands.$inferSelect & {
  standGroup: Pick<
    typeof standGroups.$inferSelect,
    "id" | "type" | "fullTablePrice"
  > | null;
  standSubcategories: Array<{
    subcategory: Pick<typeof subcategories.$inferSelect, "label" | "category">;
  }>;
};

export type ExportableSector = typeof festivalSectors.$inferSelect & {
  stands: ExportableStand[];
  mapElements: Array<typeof mapElements.$inferSelect>;
};

/**
 * One sector as a template: its map bounds, its stands with everything that
 * prices them, its signage, and its stand groups — full tables included.
 *
 * Stands are ordered by id so exporting the same sector twice gives the same
 * file, and groups point at stands by their position in that list: ids mean
 * nothing in the database the file is imported into.
 */
export function buildSectorTemplate(sector: ExportableSector): SectorTemplate {
  const orderedStands = [...sector.stands].sort((a, b) => a.id - b.id);

  const groupsById = new Map<
    number,
    { group: NonNullable<ExportableStand["standGroup"]>; indexes: number[] }
  >();
  orderedStands.forEach((stand, index) => {
    if (!stand.standGroup) return;
    const entry = groupsById.get(stand.standGroup.id) ?? {
      group: stand.standGroup,
      indexes: [],
    };
    entry.indexes.push(index);
    groupsById.set(stand.standGroup.id, entry);
  });

  const groups: StandGroupTemplate[] = [...groupsById.values()]
    // A full table that has lost a half no longer describes a table, and the
    // import refuses a file holding one; carry its remaining stand ungrouped.
    .filter(
      ({ group, indexes }) =>
        group.type !== "full_table" || indexes.length === 2,
    )
    .map(({ group, indexes }) => ({
      type: group.type,
      fullTablePrice: group.type === "full_table" ? group.fullTablePrice : null,
      standIndexes: indexes,
    }));

  return {
    name: sector.name,
    description: sector.description,
    orderInFestival: sector.orderInFestival,
    mapBounds: {
      originX: sector.mapOriginX,
      originY: sector.mapOriginY,
      width: sector.mapWidth,
      height: sector.mapHeight,
    },
    stands: orderedStands.map(
      (stand): StandTemplate => ({
        label: stand.label,
        standNumber: stand.standNumber,
        standCategory: stand.standCategory,
        zone: stand.zone,
        orientation: stand.orientation,
        width: stand.width,
        height: stand.height,
        positionLeft: stand.positionLeft ?? 0,
        positionTop: stand.positionTop ?? 0,
        price: stand.individualPrice,
        individualPrice: stand.individualPrice,
        sharedPrice: stand.sharedPrice,
        participationType: stand.participationType,
        subcategories:
          stand.standSubcategories.length > 0
            ? stand.standSubcategories.map(({ subcategory }) => ({
                category: subcategory.category,
                label: subcategory.label,
              }))
            : undefined,
      }),
    ),
    elements:
      sector.mapElements.length > 0
        ? sector.mapElements.map(
            (el): MapElementTemplate => ({
              type: el.type,
              label: el.label,
              labelPosition: el.labelPosition,
              labelFontSize: el.labelFontSize,
              showIcon: el.showIcon,
              labelFontWeight: el.labelFontWeight,
              rotation: el.rotation ?? 0,
              positionLeft: el.positionLeft,
              positionTop: el.positionTop,
              width: el.width,
              height: el.height,
            }),
          )
        : undefined,
    groups: groups.length > 0 ? groups : undefined,
  };
}

/** The key a subcategory is matched by across databases. */
export function subcategoryKey(category: string, label: string): string {
  return `${category}:${label.trim().toLowerCase()}`;
}

/** The stand row a template stand becomes, minus where it lives. */
export function standValuesFromTemplate(stand: StandTemplate) {
  // Files from before the individual/shared split carry one price, which is
  // the individual price; it also mirrors into the legacy adapter column.
  const individualPrice = stand.individualPrice ?? stand.price;
  return {
    label: stand.label,
    standNumber: stand.standNumber,
    standCategory: stand.standCategory,
    zone: stand.zone,
    orientation: stand.orientation,
    width: stand.width,
    height: stand.height,
    positionLeft: stand.positionLeft,
    positionTop: stand.positionTop,
    price: individualPrice,
    individualPrice,
    sharedPrice: stand.sharedPrice ?? null,
    participationType: stand.participationType ?? ("standard" as const),
    status: "available" as const,
  };
}
