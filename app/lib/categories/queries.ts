"use server";

import { cache } from "react";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";

import { db } from "@/db";
import {
  profileSubcategories,
  standSubcategories,
  subcategories,
  users,
} from "@/db/schema";
import type {
  AdminCategory,
  Category,
  PublicCategory,
} from "@/app/lib/categories/definitions";

const usageSelect = {
  verified: sql<number>`coalesce(count(distinct ${users.id}) filter (where ${users.status} = 'verified'), 0)`.mapWith(
    Number,
  ),
  paused: sql<number>`coalesce(count(distinct ${users.id}) filter (where ${users.status} = 'paused'), 0)`.mapWith(
    Number,
  ),
  pending: sql<number>`coalesce(count(distinct ${users.id}) filter (where ${users.status} = 'pending'), 0)`.mapWith(
    Number,
  ),
  rejected: sql<number>`coalesce(count(distinct ${users.id}) filter (where ${users.status} = 'rejected'), 0)`.mapWith(
    Number,
  ),
  banned: sql<number>`coalesce(count(distinct ${users.id}) filter (where ${users.status} = 'banned'), 0)`.mapWith(
    Number,
  ),
  stands: sql<number>`coalesce(count(distinct ${standSubcategories.id}), 0)`.mapWith(
    Number,
  ),
};

const areaOrder = sql`case ${subcategories.category}
  when 'illustration' then 0
  when 'entrepreneurship' then 1
  when 'gastronomy' then 2
  else 3
end`;

export const fetchPublicCategories = cache(
  async (): Promise<PublicCategory[]> => {
    try {
      return await db
        .select({
          id: subcategories.id,
          label: subcategories.label,
          category: subcategories.category,
          descriptionHtml: subcategories.descriptionHtml,
          imageUrl: subcategories.imageUrl,
          sortOrder: subcategories.sortOrder,
          visibility: subcategories.visibility,
        })
        .from(subcategories)
        .where(inArray(subcategories.visibility, ["listed", "selectable"]))
        .orderBy(areaOrder, asc(subcategories.sortOrder), asc(subcategories.label));
    } catch (error) {
      console.error("Error fetching public categories", error);
      return [];
    }
  },
);

export const fetchSelectableCategories = cache(async (): Promise<Category[]> => {
  try {
    return await db
      .select()
      .from(subcategories)
      .where(
        and(
          eq(subcategories.visibility, "selectable"),
          eq(subcategories.isAdminAssignableOnly, false),
        ),
      )
      .orderBy(areaOrder, asc(subcategories.sortOrder), asc(subcategories.label));
  } catch (error) {
    console.error("Error fetching selectable categories", error);
    return [];
  }
});

export const fetchAdminAssignableCategories = cache(
  async (): Promise<Category[]> => {
    try {
      return await db
        .select()
        .from(subcategories)
        .where(inArray(subcategories.visibility, ["listed", "selectable"]))
        .orderBy(
          areaOrder,
          asc(subcategories.sortOrder),
          asc(subcategories.label),
        );
    } catch (error) {
      console.error("Error fetching admin-assignable categories", error);
      return [];
    }
  },
);

export const fetchAdminCategories = cache(async (): Promise<AdminCategory[]> => {
  try {
    return await db
      .select({
        ...getTableColumns(subcategories),
        ...usageSelect,
      })
      .from(subcategories)
      .leftJoin(
        profileSubcategories,
        eq(profileSubcategories.subcategoryId, subcategories.id),
      )
      .leftJoin(users, eq(users.id, profileSubcategories.profileId))
      .leftJoin(
        standSubcategories,
        eq(standSubcategories.subcategoryId, subcategories.id),
      )
      .groupBy(subcategories.id)
      .orderBy(areaOrder, asc(subcategories.sortOrder), asc(subcategories.label));
  } catch (error) {
    console.error("Error fetching admin categories", error);
    return [];
  }
});

type CategoryExecutor = Pick<typeof db, "select">;

export async function loadCategoryWithCounts(
  id: number,
  executor: CategoryExecutor = db,
): Promise<AdminCategory | null> {
  const [row] = await executor
    .select({
      ...getTableColumns(subcategories),
      ...usageSelect,
    })
    .from(subcategories)
    .leftJoin(
      profileSubcategories,
      eq(profileSubcategories.subcategoryId, subcategories.id),
    )
    .leftJoin(users, eq(users.id, profileSubcategories.profileId))
    .leftJoin(
      standSubcategories,
      eq(standSubcategories.subcategoryId, subcategories.id),
    )
    .where(eq(subcategories.id, id))
    .groupBy(subcategories.id)
    .limit(1);
  return row ?? null;
}

export async function fetchAdminCategory(
  id: number,
): Promise<AdminCategory | null> {
  try {
    return await loadCategoryWithCounts(id);
  } catch (error) {
    console.error("Error fetching admin category", error);
    return null;
  }
}

export async function fetchCategoryUsageCounts(id: number) {
  const row = await fetchAdminCategory(id);
  if (!row) return null;
  return {
    verified: row.verified,
    paused: row.paused,
    pending: row.pending,
    rejected: row.rejected,
    banned: row.banned,
    stands: row.stands,
  };
}
