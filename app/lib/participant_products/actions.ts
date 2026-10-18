"use server";

import { NewParticipantProduct } from "@/app/lib/participant_products/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import {
  deleteStoredFile,
  getUploadThingFileKey,
} from "@/app/lib/uploadthing/storage";
import { verifyUploadReceipt } from "@/app/lib/uploadthing/upload-receipt";
import { db } from "@/db";
import { participantProducts, reservationParticipants } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * The UploadThing key of a bare file URL, or null. A query or fragment is
 * refused because it names the same file under a different string.
 */
function bareUploadThingFileKey(url: unknown) {
  if (typeof url !== "string" || /[?#]/.test(url)) return null;
  return getUploadThingFileKey(url);
}

export async function createParticipantProduct(
  newParticipantProduct: Pick<
    NewParticipantProduct,
    "name" | "description" | "imageUrl" | "participationId"
  > & {
    /** From the `imageUploader` route's response; proves the caller uploaded `imageUrl`. */
    uploadReceipt: string;
  },
) {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile || profile.status !== "verified") {
      return {
        success: false,
        message:
          "Tu perfil debe estar verificado y activo para agregar productos.",
      };
    }

    // Deleting a product deletes the file its row points at, so the row may
    // only point at an UploadThing file the caller uploaded. Every upload URL
    // is public, so without the receipt a participant could aim a product at
    // anyone's avatar or the festival's artwork and delete it with the product.
    const { name, description, imageUrl, participationId, uploadReceipt } =
      newParticipantProduct;
    const fileKey = bareUploadThingFileKey(imageUrl);
    if (!fileKey) {
      return {
        success: false,
        message: "La imagen no es válida. Subila de nuevo.",
      };
    }

    if (
      !verifyUploadReceipt({
        route: "imageUploader",
        uploaderId: profile.clerkId,
        imageUrl,
        receipt: uploadReceipt,
      })
    ) {
      return {
        success: false,
        message: "No pudimos verificar la imagen. Subila de nuevo.",
      };
    }

    const [participation] = await db
      .select({ id: reservationParticipants.id })
      .from(reservationParticipants)
      .where(
        and(
          eq(reservationParticipants.id, participationId),
          eq(reservationParticipants.userId, profile.id),
        ),
      )
      .limit(1);

    if (!participation) {
      return {
        success: false,
        message:
          "No tienes permiso para agregar productos a esta participación.",
      };
    }

    // Two rows sharing a file would let deleting one take the other's image.
    // Compared by key, since the same file has more than one URL (utfs.io and
    // ufs.sh hosts).
    const [imageInUse] = await db
      .select({ id: participantProducts.id })
      .from(participantProducts)
      .where(
        sql`split_part(${participantProducts.imageUrl}, '/f/', 2) = ${fileKey}`,
      )
      .limit(1);

    if (imageInUse) {
      return {
        success: false,
        message:
          "Esta imagen ya está asociada a otro producto. Subí una imagen nueva.",
      };
    }

    // Only the fields a participant may set. Review status and feedback stay
    // at their defaults until staff review the product.
    await db.insert(participantProducts).values({
      name,
      description,
      imageUrl,
      participationId: participation.id,
      userId: profile.id,
    });
  } catch (error) {
    console.error("Error creating participant product", error);
    return {
      success: false,
      message: "Error al agregar el producto",
    };
  }

  revalidatePath("/my_participations/submit_products");
  return {
    success: true,
    message: "Producto agregado correctamente",
  };
}

/**
 * Deletes a product and its image. The participant may delete their own, and
 * staff may delete any from the participation review page. The file deleted
 * is the one the row points at, never a URL sent by the client.
 */
export async function deleteParticipantProduct(productId: number) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { success: false, message: "No autorizado" };
  }

  const isStaff = profile.role === "admin" || profile.role === "festival_admin";

  let deleted: { userId: number; participationId: number } | undefined;
  try {
    deleted = await db.transaction(async (tx) => {
      const [product] = await tx
        .delete(participantProducts)
        .where(
          isStaff
            ? eq(participantProducts.id, productId)
            : and(
                eq(participantProducts.id, productId),
                eq(participantProducts.userId, profile.id),
              ),
        )
        .returning({
          userId: participantProducts.userId,
          participationId: participantProducts.participationId,
          imageUrl: participantProducts.imageUrl,
        });

      if (!product) return undefined;

      const imageDeleted = await deleteStoredFile(product.imageUrl);
      if (!imageDeleted.success) {
        throw new Error(imageDeleted.error);
      }

      return product;
    });
  } catch (error) {
    console.error("Error deleting participant product", error);
    return {
      success: false,
      message: "Error al eliminar el producto",
    };
  }

  if (!deleted) {
    return { success: false, message: "No autorizado" };
  }

  revalidatePath("/my_participations/submit_products");
  revalidatePath(
    `/profiles/${deleted.userId}/participations/${deleted.participationId}/products`,
  );
  return { success: true, message: "Producto eliminado correctamente" };
}
