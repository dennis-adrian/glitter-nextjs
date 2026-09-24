import "server-only";

import { cache } from "react";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  festivals,
  merchCollections,
  merchCollectionProducts,
  products,
} from "@/db/schema";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import type { MerchCollection } from "./definitions";

type ProductTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function syncMerchCollections(
  tx: ProductTx,
  productId: number,
  collectionIds: number[] | undefined,
  storeCategory: string | undefined,
) {
  if (collectionIds === undefined && storeCategory !== "supplies") return;
  const ids =
    storeCategory === "supplies" ? [] : [...new Set(collectionIds ?? [])];
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Invalid collection");
  }
  if (ids.length) {
    const existing = await tx
      .select({ id: merchCollections.id })
      .from(merchCollections)
      .where(inArray(merchCollections.id, ids));
    if (existing.length !== ids.length) throw new Error("Collection not found");
  }
  await tx
    .delete(merchCollectionProducts)
    .where(eq(merchCollectionProducts.productId, productId));
  if (ids.length) {
    await tx
      .insert(merchCollectionProducts)
      .values(ids.map((collectionId) => ({ collectionId, productId })));
  }
}

export async function fetchCollectionEditorData(productId?: number) {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") throw new Error("Unauthorized");
  const [options, assigned] = await Promise.all([
    db
      .select({ id: merchCollections.id, name: merchCollections.name })
      .from(merchCollections)
      .orderBy(asc(merchCollections.sortOrder), desc(merchCollections.id)),
    productId === undefined
      ? Promise.resolve([])
      : db
          .select({ id: merchCollectionProducts.collectionId })
          .from(merchCollectionProducts)
          .where(eq(merchCollectionProducts.productId, productId)),
  ]);
  return { options, selectedIds: assigned.map(({ id }) => id) };
}

export async function fetchMerchCollections(): Promise<MerchCollection[]> {
  // Publication and ordering belong to the collection, independently of festivals.
  const rows = await db
    .select({
      id: merchCollections.id,
      name: merchCollections.name,
      slug: merchCollections.slug,
      description: merchCollections.description,
      imageUrl: merchCollections.imageUrl,
      campaignImageUrl: merchCollections.campaignImageUrl,
      campaignTextTone: merchCollections.campaignTextTone,
      showInHero: merchCollections.showInHero,
      productId: products.id,
    })
    .from(merchCollectionProducts)
    .innerJoin(
      merchCollections,
      eq(merchCollections.id, merchCollectionProducts.collectionId),
    )
    .innerJoin(products, eq(products.id, merchCollectionProducts.productId))
    .where(
      and(
        eq(merchCollections.isVisible, true),
        eq(products.isVisible, true),
        eq(products.storeCategory, "merch"),
      ),
    )
    .orderBy(asc(merchCollections.sortOrder), desc(merchCollections.id));
  const collections = new Map<number, MerchCollection>();
  for (const row of rows) {
    const collection = collections.get(row.id) ?? {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.imageUrl,
      campaignImageUrl: row.campaignImageUrl,
      campaignTextTone: row.campaignTextTone,
      showInHero: row.showInHero,
      productIds: [],
    };
    collection.productIds.push(row.productId);
    collections.set(row.id, collection);
  }
  return [...collections.values()];
}

export async function fetchCollectionManagement() {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") throw new Error("Unauthorized");
  const [collections, memberships, festivalOptions, productOptions] =
    await Promise.all([
      db
        .select()
        .from(merchCollections)
        .orderBy(asc(merchCollections.sortOrder), desc(merchCollections.id)),
      db.select().from(merchCollectionProducts),
      db
        .select({ id: festivals.id, name: festivals.name })
        .from(festivals)
        .orderBy(desc(festivals.createdAt)),
      db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.storeCategory, "merch"))
        .orderBy(asc(products.name)),
    ]);
  return {
    collections: collections.map((collection) => ({
      ...collection,
      productIds: memberships
        .filter((item) => item.collectionId === collection.id)
        .map((item) => item.productId),
    })),
    festivalOptions,
    productOptions,
  };
}

// Share the public visibility rules and deduplicate page/metadata reads.
export const fetchPublicMerchCollection = cache(async (slug: string) => {
  const collections = await fetchMerchCollections();
  return collections.find((collection) => collection.slug === slug) ?? null;
});
