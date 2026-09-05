import { currentUser } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";

import { fetchUserProfile } from "@/app/api/users/actions";
import {
  getCreditTopUpUploadTarget,
  submitCreditTopUpVoucher,
} from "@/app/lib/credits/service";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { resolveReservationPaymentUpload } from "@/app/lib/payments/helpers";
import { activateFullTableAccessAfterPurchase } from "@/app/lib/reservations/full-table-service";
import { resolvePurchaseAccessWithLazyViewer } from "@/app/lib/programs/access";
import { hashAccessToken } from "@/app/lib/programs/tokens";
import {
  resolveVoucherSubmission,
  VOUCHER_BLOCKER_LABELS,
} from "@/app/lib/programs/vouchers";
import { submitPaymentProof } from "@/app/lib/reservations/payment-service";
import { db } from "@/db";
import { invoices, orders, productImages, sessionPurchases } from "@/db/schema";

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
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .middleware(async ({ input }) => {
      const user = await currentUser();

      if (!user) {
        throw new UploadThingError(
          "Tenés que iniciar sesión para subir un comprobante",
        );
      }

      const profile = await fetchUserProfile(user.id);

      if (!profile) {
        throw new UploadThingError(
          "Tenés que tener un perfil para subir un comprobante",
        );
      }

      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, input.invoiceId),
        with: {
          reservation: true,
        },
      });
      const resolved = resolveReservationPaymentUpload({
        invoice,
        profile: { id: profile.id, role: profile.role },
      });
      if (!resolved.ok) {
        throw new UploadThingError(resolved.message);
      }

      return {
        profileId: profile.id,
        role: profile.role,
        invoiceId: resolved.invoiceId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const uploaded = file as { url?: string; ufsUrl?: string; key?: string };
      const voucherUrl = uploaded.ufsUrl ?? uploaded.url;
      if (!voucherUrl) {
        throw new UploadThingError("No se pudo leer la URL del comprobante");
      }
      if (!uploaded.key) {
        throw new UploadThingError("No se pudo leer la identidad del archivo");
      }

      const result = await submitPaymentProof(
        {
          invoiceId: metadata.invoiceId,
          voucherUrl,
          fileKey: uploaded.key,
          source: "uploadthing" as const,
        },
        { id: metadata.profileId, role: metadata.role },
      );
      if (!result.success) {
        throw new UploadThingError(result.message);
      }

      return {
        results: {
          profileId: metadata.profileId,
          invoiceId: metadata.invoiceId,
          imageUrl: voucherUrl,
          submissionId: result.data.submissionId,
        },
      };
    }),
  creditTopUpVoucher: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .input(z.object({ topUpId: z.number().int().positive() }))
    .middleware(async ({ input }) => {
      const user = await currentUser();
      if (!user) {
        throw new UploadThingError(
          "Tenés que iniciar sesión para subir un comprobante",
        );
      }
      const profile = await fetchUserProfile(user.id);
      if (!profile) {
        throw new UploadThingError(
          "Tenés que tener un perfil para subir un comprobante",
        );
      }
      const target = await getCreditTopUpUploadTarget({
        topUpId: input.topUpId,
        userId: profile.id,
      });
      if (!target.ok) {
        throw new UploadThingError(
          "La carga de créditos ya no está disponible",
        );
      }
      return { profileId: profile.id, topUpId: target.data.topUpId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const uploaded = file as { url?: string; ufsUrl?: string; key?: string };
      const voucherUrl = uploaded.ufsUrl ?? uploaded.url;
      if (!voucherUrl || !uploaded.key) {
        throw new UploadThingError("No se pudo leer el comprobante");
      }
      const result = await submitCreditTopUpVoucher({
        topUpId: metadata.topUpId,
        userId: metadata.profileId,
        voucherUrl,
        fileKey: uploaded.key,
      });
      if (!result.ok) {
        throw new UploadThingError("No se pudo registrar la carga de créditos");
      }

      // Buying from a full-table screen is the participant saying what the
      // credits are for, so the purchase doubles as the activation. Only
      // `feature` carries that intent — an invoice or debt top-up funds
      // something else entirely.
      //
      // Deliberately after the credits are issued and outside their
      // transaction: activation takes festival and credit-account locks in its
      // own order, and a refusal here must not undo a paid-for top-up. The
      // participant simply activates from the panel instead.
      // Only a full-table purchase activates anything on issuance. A release
      // is funded the same way but activates nothing: the participant chooses
      // when to give the reservation up, and earmarking their credits here
      // would spend them on a table they never asked for. Rows predating
      // `intended_feature_type` are null and were all full table.
      if (
        result.data.intendedUse.type === "feature" &&
        result.data.intendedUse.id != null &&
        (result.data.intendedUse.featureType === "full_table" ||
          result.data.intendedUse.featureType == null)
      ) {
        try {
          const activation = await activateFullTableAccessAfterPurchase({
            userId: metadata.profileId,
            festivalId: result.data.intendedUse.id,
            topUpId: result.data.topUpId,
          });
          if (!activation.success) {
            console.info(
              `Full-table access not activated after top-up ${result.data.topUpId}: ${activation.code}`,
            );
          }
        } catch (error) {
          console.error("Error activating full table after top-up", error);
        }
      }

      return {
        results: {
          topUpId: result.data.topUpId,
          imageUrl: voucherUrl,
        },
      };
    }),
  adminReservationPayment: f({ image: { maxFileSize: "4MB" } })
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .middleware(async ({ input }) => {
      const user = await currentUser();

      if (!user) {
        throw new UploadThingError(
          "Tenés que iniciar sesión para subir un comprobante",
        );
      }

      const profile = await fetchUserProfile(user.id);

      if (!profile) {
        throw new UploadThingError(
          "Tenés que tener un perfil para subir un comprobante",
        );
      }

      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, input.invoiceId),
        with: {
          reservation: true,
        },
      });
      const resolved = resolveReservationPaymentUpload({
        invoice,
        profile: { id: profile.id, role: profile.role },
        adminPath: true,
      });
      if (!resolved.ok) {
        throw new UploadThingError(resolved.message);
      }

      return {
        profileId: profile.id,
        role: profile.role,
        invoiceId: resolved.invoiceId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const uploaded = file as { url?: string; ufsUrl?: string; key?: string };
      const voucherUrl = uploaded.ufsUrl ?? uploaded.url;
      if (!voucherUrl) {
        throw new UploadThingError("No se pudo leer la URL del comprobante");
      }
      if (!uploaded.key) {
        throw new UploadThingError("No se pudo leer la identidad del archivo");
      }

      const result = await submitPaymentProof(
        {
          invoiceId: metadata.invoiceId,
          voucherUrl,
          fileKey: uploaded.key,
          source: "uploadthing" as const,
        },
        { id: metadata.profileId, role: metadata.role },
      );
      if (!result.success) {
        throw new UploadThingError(result.message);
      }

      return {
        results: {
          profileId: metadata.profileId,
          invoiceId: metadata.invoiceId,
          imageUrl: voucherUrl,
          submissionId: result.data.submissionId,
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
