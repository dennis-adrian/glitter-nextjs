"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  festivals,
  merchCollections,
  merchCollectionProducts,
  products,
} from "@/db/schema";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import {
  collectionInputSchema,
  type CollectionInput,
} from "./collection-schema";

export async function saveMerchCollection(input: CollectionInput) {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin")
    return {
      success: false,
      message: "No tienes permisos para administrar colecciones.",
    };
  const parsed = collectionInputSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0].message };
  const { id, productIds, ...data } = parsed.data;
  try {
    const collectionId = await db.transaction(async (tx) => {
      if (data.festivalId !== null) {
        const [festival] = await tx
          .select({ id: festivals.id })
          .from(festivals)
          .where(eq(festivals.id, data.festivalId));
        if (!festival)
          throw new Error("El festival seleccionado ya no existe.");
      }
      const ids = [...new Set(productIds)];
      if (ids.length) {
        const found = await tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(inArray(products.id, ids), eq(products.storeCategory, "merch")),
          );
        if (found.length !== ids.length)
          throw new Error(
            "Selecciona únicamente productos de merch existentes.",
          );
      }
      const values = {
        ...data,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        campaignImageUrl: data.campaignImageUrl || null,
        campaignTextTone: data.campaignTextTone ?? "dark",
        showInHero: data.showInHero ?? false,
        updatedAt: new Date(),
      };
      const [saved] =
        id === undefined
          ? await tx
              .insert(merchCollections)
              .values(values)
              .returning({ id: merchCollections.id })
          : await tx
              .update(merchCollections)
              .set(values)
              .where(eq(merchCollections.id, id))
              .returning({ id: merchCollections.id });
      if (!saved) throw new Error("La colección ya no existe.");
      await tx
        .delete(merchCollectionProducts)
        .where(eq(merchCollectionProducts.collectionId, saved.id));
      if (ids.length)
        await tx
          .insert(merchCollectionProducts)
          .values(
            ids.map((productId) => ({ collectionId: saved.id, productId })),
          );
      return saved.id;
    });
    revalidatePath("/merch", "layout");
    revalidatePath("/dashboard/store/collections", "layout");
    revalidatePath("/dashboard/store/products", "layout");
    return { success: true, message: "Colección guardada.", collectionId };
  } catch {
    return {
      success: false,
      message:
        "No se pudo guardar. Verifica que la URL sea única y que los productos y el festival sigan disponibles.",
    };
  }
}
