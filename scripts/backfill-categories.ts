import { eq } from "drizzle-orm";

import { db } from "@/db";
import { subcategories } from "@/db/schema";
import {
  HARDCODED_CATEGORY_COPY,
  findSeedCopy,
  paragraphsToCompactBlocks,
  paragraphsToHtml,
  unmatchedHardcodedTitles,
} from "@/app/lib/categories/seed-copy";
import {
  labelContainsNormalized,
  normalizeCategoryLabel,
} from "@/app/lib/categories/label";

export async function backfillCategoryCatalog() {
  const rows = await db.select().from(subcategories);
  const unmatched = unmatchedHardcodedTitles(rows);
  if (unmatched.length > 0) {
    console.info(
      "Unmatched hardcoded category titles (create by hand if needed):",
      unmatched.join(", "),
    );
  }

  for (const row of rows) {
    const seed = findSeedCopy(row.label, row.category);
    const isExclusive =
      labelContainsNormalized(row.label, "skincare") ||
      labelContainsNormalized(row.label, "skin care");
    const isAdminAssignableOnly = labelContainsNormalized(
      row.label,
      "sublimacion",
    );

    const patch: {
      isExclusive: boolean;
      isAdminAssignableOnly: boolean;
      visibility?: "listed";
      descriptionHtml?: string;
      descriptionJson?: unknown;
      updatedAt: Date;
    } = {
      isExclusive,
      isAdminAssignableOnly,
      updatedAt: new Date(),
    };

    if (isAdminAssignableOnly) {
      patch.visibility = "listed";
    }

    if (seed && !row.descriptionHtml) {
      patch.descriptionHtml =
        seed.htmlOverride ?? paragraphsToHtml(seed.paragraphs);
      patch.descriptionJson = paragraphsToCompactBlocks(seed.paragraphs);
    }

    await db
      .update(subcategories)
      .set(patch)
      .where(eq(subcategories.id, row.id));
  }

  for (const seed of HARDCODED_CATEGORY_COPY.filter(
    (entry) => entry.insertIfMissing,
  )) {
    const exists = rows.some(
      (row) =>
        row.category === seed.area &&
        normalizeCategoryLabel(row.label) ===
          normalizeCategoryLabel(seed.title),
    );
    if (exists) continue;

    await db.insert(subcategories).values({
      label: seed.title,
      category: seed.area,
      descriptionHtml: seed.htmlOverride ?? paragraphsToHtml(seed.paragraphs),
      descriptionJson: paragraphsToCompactBlocks(seed.paragraphs),
      visibility: "selectable",
    });
  }
}
