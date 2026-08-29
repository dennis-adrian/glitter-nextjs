import { currentUser } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";

import { fetchUserProfile } from "@/app/api/users/actions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { resolvePurchaseAccessWithLazyViewer } from "@/app/lib/programs/access";
import { hashAccessToken } from "@/app/lib/programs/tokens";
import {
  resolveVoucherSubmission,
  VOUCHER_BLOCKER_LABELS,
} from "@/app/lib/programs/vouchers";
import { db } from "@/db";
import { orders, productImages, sessionPurchases } from "@/db/schema";

const f = createUploadthing();

// const auth = (req: Request) => ({ id: "fakeId" }); // Fake auth function

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  festivalArtwork: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const profile = await requireAdminOrFestivalAdmin();
      if (!profile) throw new UploadThingError("No autorizado");
      return { userId: profile.id };
    })
    .onUploadComplete(({ file }) => ({
      imageUrl: (file as { url: string }).url,
    })),
  landingPageImageUploader: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const profile = await requireAdminOrFestivalAdmin();
      if (!profile) throw new UploadThingError("No autorizado");
      return { userId: profile.id };
    })
    .onUploadComplete(({ metadata, file }) => ({
      imageUrl: (file as { url: string }).url,
      uploadedBy: metadata.userId,
    })),
  // Define as many FileRoutes as you like, each with a unique routeSlug
  profilePicture: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      // This code runs on your server before upload
      const user = await currentUser();

      // Throw if user isn't signed in
      if (!user) {
        throw new UploadThingError(
          "You must be logged in to upload a profile picture",
        );
      }

      const profile = await fetchUserProfile(user.id);

      if (!profile) {
        throw new UploadThingError(
          "You must have a profile to upload a profile picture",
        );
      }

      return { profile };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        results: {
          profileId: metadata.profile.id,
          imageUrl: (file as { url: string }).url,
        },
      };
    }),
  reservationPayment: f({ image: { maxFileSize: "4MB" } })
    .middleware(async ({ req }) => {
      // This code runs on your server before upload
      const user = await currentUser();

      // Throw if user isn't signed in
      if (!user) {
        throw new UploadThingError(
          "You must be logged in to upload a profile picture",
        );
      }

      const profile = await fetchUserProfile(user.id);

      if (!profile) {
        throw new UploadThingError(
          "You must have a profile to upload a payment proof",
        );
      }

      return { profile };
    })
    .onUploadComplete(({ metadata, file }) => {
      return {
        results: {
          profileId: metadata.profile.id,
          imageUrl: (file as { url: string }).url,
        },
      };
    }),
  imageUploader: f({ image: { maxFileSize: "4MB" } })
    // Set permissions and file types for this FileRoute
    .middleware(async ({ req }) => {
      const user = await currentUser();

      // Throw if user isn't signed in
      if (!user)
        throw new UploadThingError(
          "You must be logged in to upload a profile picture",
        );

      // Return userId to be used in onUploadComplete
      return { userId: user.id };
      // This code runs on your server before upload
      // const user = await auth(req);

      // If you throw, the user will not be able to upload
      // if (!user) throw new UploadThingError("Unauthorized");

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      // return { userId: user.id };
      return {};
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      // console.log("Upload complete for userId:", metadata.userId);

      // console.log("file url", file.url);

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { uploadedBy: metadata.userId };
    }),
  storeOrderPayment: f({ image: { maxFileSize: "4MB" } })
    .middleware(async ({ req }) => {
      const user = await currentUser();

      if (!user) {
        throw new UploadThingError("Debes iniciar sesión");
      }

      const profile = await fetchUserProfile(user.id);

      if (!profile) {
        throw new UploadThingError("Perfil no encontrado");
      }

      return { profile };
    })
    .onUploadComplete(({ metadata, file }) => {
      return {
        results: {
          profileId: metadata.profile.id,
          imageUrl: (file as { url: string }).url,
        },
      };
    }),
  /**
   * A payment proof for a program session purchase.
   *
   * Gated on `paid_programs` first, then authorized exactly like the purchase
   * page — owner *or* secure token, never "is signed in" — and refused outright
   * if the purchase is not in a state that accepts a voucher, so a disabled
   * feature or an expired hold cannot even spend upload quota.
   * `submitPurchaseVoucher` re-checks all of it before it writes anything.
   */
  sessionPurchaseVoucher: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .input(
      z.object({
        purchaseId: z.number().int().positive(),
        token: z.string().trim().min(1).optional(),
      }),
    )
    .middleware(async ({ input }) => {
      // Before any lookup: a disabled feature should not accept bytes, and
      // should not confirm whether a purchase id exists either.
      if (!(await isFeatureEnabled("paid_programs"))) {
        throw new UploadThingError("Compra no encontrada");
      }

      const purchase = await db.query.sessionPurchases.findFirst({
        where: eq(sessionPurchases.id, input.purchaseId),
      });
      if (!purchase) throw new UploadThingError("Compra no encontrada");

      const { access } = await resolvePurchaseAccessWithLazyViewer({
        purchase,
        presentedTokenHash: input.token ? hashAccessToken(input.token) : null,
        loadViewer: async () => {
          const user = await currentUser();
          return user ? ((await fetchUserProfile(user.id)) ?? null) : null;
        },
        getViewerUserId: (profile) => profile.id,
      });
      if (!access.granted) throw new UploadThingError("Compra no encontrada");

      const check = resolveVoucherSubmission(purchase);
      if (!check.allowed) {
        throw new UploadThingError(VOUCHER_BLOCKER_LABELS[check.blocker]);
      }

      return { purchaseId: purchase.id };
    })
    // The key travels with the URL so `submitPurchaseVoucher` can verify the
    // address it is handed is this upload and not an arbitrary one.
    .onUploadComplete(({ file }) => ({
      results: {
        imageUrl: (file as { url: string }).url,
        fileKey: (file as { key: string }).key,
      },
    })),
  guestOrderPayment: f({ image: { maxFileSize: "4MB" } })
    .input(
      z.object({
        orderId: z.number().int().positive(),
        token: z.string().trim().min(1),
      }),
    )
    .middleware(async ({ input }) => {
      const order = await db.query.orders.findFirst({
        where: and(
          eq(orders.id, input.orderId),
          eq(orders.guestOrderToken, input.token),
          eq(orders.status, "pending"),
          isNull(orders.userId),
        ),
      });
      if (!order) throw new UploadThingError("Orden no encontrada");
      return { orderId: input.orderId };
    })
    .onUploadComplete(({ file }) => ({
      results: { imageUrl: (file as { url: string }).url },
    })),
  festivalActivityParticipantProof: f({
    image: { maxFileSize: "4MB", maxFileCount: 5, minFileCount: 1 },
  })
    // Set permissions and file types for this FileRoute
    .middleware(async ({ req }) => {
      const user = await currentUser();

      // Throw if user isn't signed in
      if (!user)
        throw new UploadThingError(
          "Debes iniciar sesión para subir el archivo",
        );

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return {
        uploadedBy: metadata.userId,
        imageUrl: (file as { url: string }).url,
      };
    }),
  qrCode: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await currentUser();
      if (!user) throw new UploadThingError("Debes iniciar sesión");

      const profile = await fetchUserProfile(user.id);
      if (!profile || profile.role !== "admin") {
        throw new UploadThingError("No tienes permisos para subir códigos QR");
      }

      return { userId: user.id };
    })
    .onUploadComplete(({ file }) => ({
      imageUrl: (file as { url: string }).url,
    })),
  externalParticipantImage: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const user = await currentUser();
      if (!user) throw new UploadThingError("Debes iniciar sesión");

      const profile = await fetchUserProfile(user.id);
      if (
        !profile ||
        (profile.role !== "admin" && profile.role !== "festival_admin")
      ) {
        throw new UploadThingError(
          "No tienes permisos para subir imágenes de participantes externos",
        );
      }

      return { userId: user.id };
    })
    .onUploadComplete(({ file }) => ({
      imageUrl: (file as { url: string }).url,
    })),
  speakerImage: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const user = await currentUser();
      if (!user) throw new UploadThingError("Debes iniciar sesión");

      const profile = await fetchUserProfile(user.id);
      if (
        !profile ||
        (profile.role !== "admin" && profile.role !== "festival_admin")
      ) {
        throw new UploadThingError(
          "No tienes permisos para subir imágenes de expositores",
        );
      }

      return { userId: user.id };
    })
    .onUploadComplete(({ file }) => ({
      imageUrl: (file as { url: string }).url,
    })),
  programArtwork: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const user = await currentUser();
      if (!user) throw new UploadThingError("Debes iniciar sesión");

      const profile = await fetchUserProfile(user.id);
      if (!profile || profile.role !== "admin") {
        throw new UploadThingError(
          "No tienes permisos para subir imágenes de programas",
        );
      }

      return { userId: user.id };
    })
    .onUploadComplete(({ file }) => ({
      imageUrl: (file as { url: string }).url,
    })),
  productImage: f({ image: { maxFileSize: "4MB", maxFileCount: 10 } })
    .middleware(async ({ req }) => {
      const user = await currentUser();

      if (!user) throw new UploadThingError("Debes iniciar sesión");

      const profile = await fetchUserProfile(user.id);

      if (!profile || profile.role !== "admin") {
        throw new UploadThingError(
          "No tienes permisos para subir imágenes de productos",
        );
      }

      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const imageUrl = (file as { url: string }).url;
      const [record] = await db
        .insert(productImages)
        .values({ imageUrl })
        .returning();
      if (!record) {
        throw new UploadThingError(
          "No se pudo guardar la imagen en la base de datos",
        );
      }
      return { imageUrl, imageId: record.id };
    }),
  categoryImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await currentUser();
      if (!user) throw new UploadThingError("Debes iniciar sesión");

      const profile = await fetchUserProfile(user.id);
      if (!profile || profile.role !== "admin") {
        throw new UploadThingError(
          "No tienes permisos para subir imágenes de categorías",
        );
      }

      return { userId: user.id };
    })
    .onUploadComplete(({ file }) => ({
      imageUrl: (file as { url: string }).url,
      fileKey: (file as { key?: string }).key,
    })),
  bannerImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await currentUser();
      if (!user) throw new UploadThingError("Debes iniciar sesión");

      const profile = await fetchUserProfile(user.id);
      if (!profile || profile.role !== "admin") {
        throw new UploadThingError(
          "No tienes permisos para subir imágenes de banners",
        );
      }

      return { userId: user.id };
    })
    .onUploadComplete(({ file }) => ({
      imageUrl: (file as { url: string }).url,
    })),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
