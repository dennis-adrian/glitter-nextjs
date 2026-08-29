import { eq } from "drizzle-orm";

import { db } from "@/db";
import { subcategories } from "@/db/schema";

export type CategoryTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function lockCategoryForMutation(
  tx: CategoryTransaction,
  categoryId: number,
) {
  const [row] = await tx
    .select({
      id: subcategories.id,
      label: subcategories.label,
      imageUrl: subcategories.imageUrl,
      imageFileKey: subcategories.imageFileKey,
    })
    .from(subcategories)
    .where(eq(subcategories.id, categoryId))
    .for("update");

  return row ?? null;
}
