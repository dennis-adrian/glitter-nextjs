import "server-only";

import { inArray } from "drizzle-orm";

import type { SectorTemplate } from "@/app/lib/map_templates/definitions";
import {
  standValuesFromTemplate,
  subcategoryKey,
} from "@/app/lib/map_templates/sector-template";
import type { DrizzleTransactionScope } from "@/db/drizzleTransactionScope";
import {
  mapElements,
  standGroups,
  standSubcategories,
  stands,
  subcategories,
} from "@/db/schema";

/** Subcategory ids in the target database, keyed by `subcategoryKey`. */
export type SubcategoryLookup = ReadonlyMap<string, number>;

/**
 * Every subcategory the templates mention that also exists here. Ids differ
 * between databases, so a file names them by category and label instead.
 */
export async function loadSubcategoryLookup(
  tx: DrizzleTransactionScope,
  sectors: readonly SectorTemplate[],
): Promise<SubcategoryLookup> {
  const mentioned = sectors.some((sector) =>
    sector.stands.some((stand) => (stand.subcategories?.length ?? 0) > 0),
  );
  if (!mentioned) return new Map();

  const rows = await tx
    .select({
      id: subcategories.id,
      label: subcategories.label,
      category: subcategories.category,
    })
    .from(subcategories);
  return new Map(
    rows.map((row) => [subcategoryKey(row.category, row.label), row.id]),
  );
}

/**
 * Removes a sector's stand groups once its stands are gone, so a replace
 * import does not leave empty groups — or an empty full table — behind.
 */
export async function deleteSectorStandGroups(
  tx: DrizzleTransactionScope,
  sectorIds: readonly number[],
) {
  if (sectorIds.length === 0) return;
  await tx
    .delete(standGroups)
    .where(inArray(standGroups.festivalSectorId, [...sectorIds]));
}

/**
 * Creates a template sector's stands, groups, subcategory links and map
 * elements inside an existing sector. Returns how many stands it created.
 *
 * Groups are created first so each stand is inserted already pointing at its
 * group: a full table never exists, even inside the transaction, with one half
 * attached and the other not.
 */
export async function insertSectorTemplateContents(
  tx: DrizzleTransactionScope,
  input: {
    festivalId: number;
    sectorId: number;
    template: SectorTemplate;
    subcategoryLookup: SubcategoryLookup;
  },
): Promise<number> {
  const { festivalId, sectorId, template, subcategoryLookup } = input;

  const groupIdByStandIndex = new Map<number, number>();
  for (const group of template.groups ?? []) {
    const [created] = await tx
      .insert(standGroups)
      .values({
        festivalSectorId: sectorId,
        type: group.type,
        fullTablePrice:
          group.type === "full_table" ? group.fullTablePrice : null,
      })
      .returning({ id: standGroups.id });
    for (const index of group.standIndexes) {
      groupIdByStandIndex.set(index, created.id);
    }
  }

  if (template.stands.length > 0) {
    const created = await tx
      .insert(stands)
      .values(
        template.stands.map((stand, index) => ({
          ...standValuesFromTemplate(stand),
          festivalId,
          festivalSectorId: sectorId,
          standGroupId: groupIdByStandIndex.get(index) ?? null,
        })),
      )
      .returning({ id: stands.id });

    // Postgres returns the rows of a multi-row VALUES insert in the order
    // given, which is what pairs each created id with its template stand.
    const links = template.stands.flatMap((stand, index) => {
      const standId = created[index]?.id;
      if (standId == null) return [];
      const ids = new Set<number>();
      for (const ref of stand.subcategories ?? []) {
        const id = subcategoryLookup.get(
          subcategoryKey(ref.category, ref.label),
        );
        if (id != null) ids.add(id);
      }
      return [...ids].map((subcategoryId) => ({ standId, subcategoryId }));
    });
    if (links.length > 0) {
      await tx.insert(standSubcategories).values(links);
    }
  }

  const templateElements = template.elements ?? [];
  if (templateElements.length > 0) {
    await tx.insert(mapElements).values(
      templateElements.map((el) => ({
        type: el.type,
        label: el.label,
        labelPosition: el.labelPosition ?? "bottom",
        labelFontSize: el.labelFontSize ?? 2,
        showIcon: el.showIcon ?? true,
        labelFontWeight: el.labelFontWeight ?? 500,
        rotation: el.rotation ?? 0,
        positionLeft: el.positionLeft,
        positionTop: el.positionTop,
        width: el.width,
        height: el.height,
        festivalSectorId: sectorId,
      })),
    );
  }

  return template.stands.length;
}
