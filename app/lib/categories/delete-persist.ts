import { eq } from "drizzle-orm";

import { formatDeleteBlockedMessage } from "@/app/lib/categories/copy";
import { isDeleteBlocked } from "@/app/lib/categories/delete";
import {
  lockCategoryForMutation,
  type CategoryTransaction,
} from "@/app/lib/categories/locking";
import { loadCategoryWithCounts } from "@/app/lib/categories/queries";
import { subcategories } from "@/db/schema";

export type DeleteCategoryRecordResult =
  | {
      success: false;
      message: string;
      blocked?: true;
    }
  | {
      success: true;
      imageUrl: string | null;
      imageFileKey: string | null;
      label: string;
    };

/**
 * Guard and cascading delete in one transaction: lock the category row,
 * re-read blocking relationships, then delete. Concurrent inserts into
 * profile_subcategories / stand_subcategories take FOR KEY SHARE on this
 * parent row and wait for the lock.
 */
export async function deleteCategoryRecord(
  tx: CategoryTransaction,
  id: number,
): Promise<DeleteCategoryRecordResult> {
  const locked = await lockCategoryForMutation(tx, id);
  if (!locked) {
    return { success: false, message: "La categoría no existe" };
  }

  const current = await loadCategoryWithCounts(id, tx);
  if (!current) {
    return { success: false, message: "La categoría no existe" };
  }

  if (isDeleteBlocked(current)) {
    return {
      success: false,
      blocked: true,
      message: formatDeleteBlockedMessage(
        current.label,
        current.verified,
        current.paused,
        current.stands,
      ),
    };
  }

  await tx.delete(subcategories).where(eq(subcategories.id, id));
  return {
    success: true,
    imageUrl: locked.imageUrl,
    imageFileKey: locked.imageFileKey,
    label: locked.label,
  };
}
