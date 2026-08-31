import { eq } from "drizzle-orm";

import { db, pool } from "@/db";
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
  findCanonicalLabelDuplicates,
  formatCanonicalDuplicateReport,
} from "@/app/lib/categories/label";

export const CATEGORY_CATALOG_BACKFILL = "0236_manageable_categories";
export const INVOICE_VERIFICATION_PAYMENT_BACKFILL =
  "0244_invoice_verification_payment";

export async function ensureCategoryCatalogBackfillMarker() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS category_catalog_backfill (
        name text PRIMARY KEY,
        completed_at timestamp NOT NULL DEFAULT now()
      )
    `);
  } finally {
    client.release();
  }
}

export async function categoryCatalogBackfillCompleted(): Promise<boolean> {
  await ensureCategoryCatalogBackfillMarker();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM category_catalog_backfill WHERE name = $1`,
      [CATEGORY_CATALOG_BACKFILL],
    );
    return rows.length > 0;
  } finally {
    client.release();
  }
}

export async function markCategoryCatalogBackfillCompleted() {
  await ensureCategoryCatalogBackfillMarker();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO category_catalog_backfill (name) VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [CATEGORY_CATALOG_BACKFILL],
    );
  } finally {
    client.release();
  }
}

export async function invoiceVerificationPaymentBackfillCompleted(): Promise<boolean> {
  await ensureCategoryCatalogBackfillMarker();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM category_catalog_backfill WHERE name = $1`,
      [INVOICE_VERIFICATION_PAYMENT_BACKFILL],
    );
    return rows.length > 0;
  } finally {
    client.release();
  }
}

export async function markInvoiceVerificationPaymentBackfillCompleted() {
  await ensureCategoryCatalogBackfillMarker();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO category_catalog_backfill (name) VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [INVOICE_VERIFICATION_PAYMENT_BACKFILL],
    );
  } finally {
    client.release();
  }
}

export async function backfillCategoryCatalog() {
  const rows = await db.select().from(subcategories);
  const duplicates = findCanonicalLabelDuplicates(
    rows.map((row) => ({
      id: row.id,
      category: row.category,
      label: row.label,
    })),
  );
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate category labels under backfill canonicalization:\n${formatCanonicalDuplicateReport(duplicates)}`,
    );
  }
  const unmatched = unmatchedHardcodedTitles(rows);
  if (unmatched.length > 0) {
    console.info(
      "Unmatched hardcoded category titles (create by hand if needed):",
      unmatched.join(", "),
    );
  }

  const alreadyClassified = await categoryCatalogBackfillCompleted();

  for (const row of rows) {
    const seed = findSeedCopy(row.label, row.category);
    const patch: {
      isExclusive?: boolean;
      isAdminAssignableOnly?: boolean;
      visibility?: "listed";
      descriptionHtml?: string;
      descriptionJson?: unknown;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (!alreadyClassified) {
      const isExclusive =
        labelContainsNormalized(row.label, "skincare") ||
        labelContainsNormalized(row.label, "skin care");
      const isAdminAssignableOnly = labelContainsNormalized(
        row.label,
        "sublimacion",
      );

      patch.isExclusive = isExclusive;
      patch.isAdminAssignableOnly = isAdminAssignableOnly;
      if (isAdminAssignableOnly) {
        patch.visibility = "listed";
      }
    }

    if (seed && !row.descriptionHtml) {
      patch.descriptionHtml =
        seed.htmlOverride ?? paragraphsToHtml(seed.paragraphs);
      patch.descriptionJson = paragraphsToCompactBlocks(seed.paragraphs);
    }

    if (
      patch.isExclusive === undefined &&
      patch.isAdminAssignableOnly === undefined &&
      patch.visibility === undefined &&
      patch.descriptionHtml === undefined
    ) {
      continue;
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
