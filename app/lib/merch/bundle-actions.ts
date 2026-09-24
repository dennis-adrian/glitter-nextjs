"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  merchBundleCollections,
  merchBundleComponents,
  merchBundleComponentVariants,
  merchBundles,
  merchCollections,
} from "@/db/schema";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import type { BundleRecord } from "./bundle-definitions";
import {
  bundleSaveEvaluationOptions,
  evaluateBundle,
  toCents,
} from "./bundle-pricing";
import { bundleInputSchema, type BundleInput } from "./bundle-schema";
import {
  bundleRevisionSql,
  loadBundleCatalog,
  loadBundleRecords,
} from "./bundles";

class BundleSaveError extends Error {}

type SaveBundleResult = {
  success: boolean;
  message: string;
  bundleId?: number;
};

function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (
    let current: unknown = error;
    current && typeof current === "object";
    current = (current as { cause?: unknown }).cause
  ) {
    const candidate = current as { code?: unknown; constraint?: unknown };
    if (candidate.code === "23505" && candidate.constraint === constraint) {
      return true;
    }
  }
  return false;
}

type SignatureComponent = {
  key: number | "new";
  productId: number;
  quantity: number;
  variantIds: number[];
};

/**
 * Price and contents, independent of display order. Any change makes carts
 * that hold the previous version ask the customer to review the bundle.
 */
function commercialSignature(
  price: number,
  components: readonly SignatureComponent[],
) {
  return JSON.stringify({
    price: toCents(price),
    components: components
      .map((component) => [
        component.key,
        component.productId,
        component.quantity,
        [...component.variantIds].sort((a, b) => a - b),
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

function revalidateBundleViews() {
  revalidatePath("/merch", "layout");
  revalidatePath("/dashboard/store/bundles", "layout");
}

export async function saveMerchBundle(
  input: BundleInput,
): Promise<SaveBundleResult> {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para administrar combos.",
    };
  }
  const parsed = bundleInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }
  const {
    id,
    revision,
    components: rawComponents,
    collectionIds,
    ...data
  } = parsed.data;
  const components = rawComponents.map((component) => ({
    ...component,
    variantIds: [...new Set(component.variantIds)].sort((a, b) => a - b),
  }));
  const submittedIds = components
    .map((component) => component.id)
    .filter((value): value is number => value != null);
  if (new Set(submittedIds).size !== submittedIds.length) {
    return {
      success: false,
      message: "El combo contiene productos repetidos.",
    };
  }

  try {
    const bundleId = await db.transaction(async (tx) => {
      let existing: BundleRecord | undefined;
      if (id !== undefined) {
        const [locked] = await tx
          .select({ id: merchBundles.id, revision: bundleRevisionSql() })
          .from(merchBundles)
          .where(eq(merchBundles.id, id))
          .for("update");
        if (!locked) throw new BundleSaveError("El combo ya no existe.");
        // Checked under the lock: of two editors holding the same copy, only
        // the first save lands; the second would silently undo it.
        if (locked.revision !== revision) {
          throw new BundleSaveError(
            "Otra persona guardó este combo mientras lo editabas. Recargá la página para ver sus cambios.",
          );
        }
        [existing] = await loadBundleRecords(tx, { ids: [id] });
      }
      const existingComponents = new Map(
        (existing?.components ?? []).map((component) => [
          component.id,
          component,
        ]),
      );
      if (
        submittedIds.some((componentId) => !existingComponents.has(componentId))
      ) {
        throw new BundleSaveError(
          "El combo cambió en otra sesión. Recargá la página.",
        );
      }

      const catalog = await loadBundleCatalog(
        tx,
        components.map((component) => component.productId),
      );
      for (const component of components) {
        const product = catalog.get(component.productId);
        const previous =
          component.id != null ? existingComponents.get(component.id) : null;
        if (!product) {
          throw new BundleSaveError("Uno de los productos ya no existe.");
        }
        if (
          product.storeCategory !== "merch" &&
          previous?.productId !== product.id
        ) {
          throw new BundleSaveError(
            "Selecciona únicamente productos de merch.",
          );
        }
        const variantIds = new Set(
          (product.variants ?? []).map((variant) => variant.id),
        );
        if (
          component.variantIds.some((variantId) => !variantIds.has(variantId))
        ) {
          throw new BundleSaveError(
            `Una variante elegida no pertenece a ${product.name}.`,
          );
        }
      }
      const uniqueCollectionIds = [...new Set(collectionIds)];
      if (uniqueCollectionIds.length) {
        const found = await tx
          .select({ id: merchCollections.id })
          .from(merchCollections)
          .where(inArray(merchCollections.id, uniqueCollectionIds));
        if (found.length !== uniqueCollectionIds.length) {
          throw new BundleSaveError("Una de las colecciones ya no existe.");
        }
      }

      const nextComponents = components.map((component, index) => {
        const previous =
          component.id != null ? existingComponents.get(component.id) : null;
        // A component switched to another product is a new component: its
        // stored customer choices belong to the old product.
        const keptId =
          previous && previous.productId === component.productId
            ? previous.id
            : null;
        return { ...component, keptId, sortOrder: index };
      });
      const evaluation = evaluateBundle(
        {
          price: data.price,
          components: nextComponents.map((component, index) => ({
            id: component.keptId ?? -(index + 1),
            productId: component.productId,
            quantity: component.quantity,
            sortOrder: component.sortOrder,
            variantIds: component.variantIds,
          })),
        },
        catalog,
        bundleSaveEvaluationOptions(existing, data.isVisible),
      );
      if (data.isVisible && evaluation.issues.length > 0) {
        throw new BundleSaveError(
          `No se puede publicar: ${evaluation.issues[0].message}`,
        );
      }

      const nextSignature = commercialSignature(
        data.price,
        nextComponents.map((component) => ({
          key: component.keptId ?? "new",
          productId: component.productId,
          quantity: component.quantity,
          variantIds: component.variantIds,
        })),
      );
      const previousSignature = existing
        ? commercialSignature(
            existing.price,
            existing.components.map((component) => ({
              key: component.id,
              productId: component.productId,
              quantity: component.quantity,
              variantIds: component.variantIds,
            })),
          )
        : null;
      const version = !existing
        ? 1
        : previousSignature === nextSignature
          ? existing.version
          : existing.version + 1;

      const values = {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        price: data.price,
        isVisible: data.isVisible,
        sortOrder: data.sortOrder,
        version,
        updatedAt: new Date(),
      };
      const [saved] = existing
        ? await tx
            .update(merchBundles)
            .set(values)
            .where(eq(merchBundles.id, existing.id))
            .returning({ id: merchBundles.id })
        : await tx
            .insert(merchBundles)
            .values(values)
            .returning({ id: merchBundles.id });

      const keptIds = nextComponents
        .map((component) => component.keptId)
        .filter((value): value is number => value != null);
      await tx
        .delete(merchBundleComponents)
        .where(
          keptIds.length
            ? and(
                eq(merchBundleComponents.bundleId, saved.id),
                notInArray(merchBundleComponents.id, keptIds),
              )
            : eq(merchBundleComponents.bundleId, saved.id),
        );
      for (const component of nextComponents) {
        let componentId: number;
        if (component.keptId != null) {
          componentId = component.keptId;
          await tx
            .update(merchBundleComponents)
            .set({
              quantity: component.quantity,
              sortOrder: component.sortOrder,
              updatedAt: new Date(),
            })
            .where(eq(merchBundleComponents.id, componentId));
          await tx
            .delete(merchBundleComponentVariants)
            .where(eq(merchBundleComponentVariants.componentId, componentId));
        } else {
          const [created] = await tx
            .insert(merchBundleComponents)
            .values({
              bundleId: saved.id,
              productId: component.productId,
              quantity: component.quantity,
              sortOrder: component.sortOrder,
            })
            .returning({ id: merchBundleComponents.id });
          componentId = created.id;
        }
        if (component.variantIds.length) {
          await tx.insert(merchBundleComponentVariants).values(
            component.variantIds.map((variantId) => ({
              componentId,
              productId: component.productId,
              variantId,
            })),
          );
        }
      }

      await tx
        .delete(merchBundleCollections)
        .where(eq(merchBundleCollections.bundleId, saved.id));
      if (uniqueCollectionIds.length) {
        await tx.insert(merchBundleCollections).values(
          uniqueCollectionIds.map((collectionId) => ({
            bundleId: saved.id,
            collectionId,
          })),
        );
      }
      return saved.id;
    });
    revalidateBundleViews();
    return {
      success: true,
      message: data.isVisible
        ? "Combo guardado y publicado."
        : "Combo guardado como borrador.",
      bundleId,
    };
  } catch (error) {
    if (error instanceof BundleSaveError) {
      return { success: false, message: error.message };
    }
    if (isUniqueViolation(error, "merch_bundles_slug_unique")) {
      return {
        success: false,
        message: "Ya existe un combo con esa URL. Elegí otra.",
      };
    }
    console.error("saveMerchBundle error", error);
    return {
      success: false,
      message: "No se pudo guardar el combo. Intenta nuevamente.",
    };
  }
}

export async function deleteMerchBundle(
  bundleId: number,
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para administrar combos.",
    };
  }
  if (!Number.isSafeInteger(bundleId) || bundleId <= 0) {
    return { success: false, message: "Combo inválido." };
  }
  try {
    // Carts holding it cascade away; past orders keep their snapshots.
    const deleted = await db
      .delete(merchBundles)
      .where(eq(merchBundles.id, bundleId))
      .returning({ id: merchBundles.id });
    if (deleted.length === 0) {
      return { success: false, message: "El combo ya no existe." };
    }
  } catch (error) {
    console.error("deleteMerchBundle error", error);
    return { success: false, message: "No se pudo eliminar el combo." };
  }
  revalidateBundleViews();
  return { success: true, message: "Combo eliminado." };
}
