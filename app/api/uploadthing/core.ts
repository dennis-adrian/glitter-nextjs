import { fetchUserProfile } from "@/app/api/users/actions";
import { updateProfile } from "@/app/lib/users/actions";
import { currentUser } from "@clerk/nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError, UTApi } from "uploadthing/server";

const f = createUploadthing();

// const auth = (req: Request) => ({ id: "fakeId" }); // Fake auth function

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  profilePicture: f({ image: { maxFileSize: "2MB" } })
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
      const oldImageUrl = metadata.profile.imageUrl;
      const imageUrl = file.url;
      const res = await updateProfile(metadata.profile.id, {
        imageUrl,
      });

      if (res.success) {
        if (oldImageUrl && oldImageUrl.includes("utfs")) {
          const [_, key] = oldImageUrl.split("/f/");
          await new UTApi().deleteFiles(key);
        }

        return {
          ...res,
          imageUrl,
        };
      }

      return {
        ...res,
        imageUrl: null,
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
      return {};
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
