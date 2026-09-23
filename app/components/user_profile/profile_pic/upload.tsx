"use client";

import { cn } from "@/app/lib/utils";
import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import { BaseProfile } from "@/app/api/users/definitions";
import { getUserName } from "@/app/lib/users/utils";
import { useRef } from "react";
import { AvatarImage } from "../../ui/avatar";

type SignedUpload = { imageUrl: string; receipt: string };

/** The `profilePicture` route returns `{ results: { imageUrl, receipt } }`. */
function readSignedUpload(serverData: unknown): SignedUpload | null {
  if (!serverData || typeof serverData !== "object") return null;
  const results = (serverData as { results?: unknown }).results;
  if (!results || typeof results !== "object") return null;
  const { imageUrl, receipt } = results as {
    imageUrl?: unknown;
    receipt?: unknown;
  };
  if (typeof imageUrl !== "string" || typeof receipt !== "string") {
    return null;
  }
  return { imageUrl, receipt };
}

export default function ProfilePicUpload({
  size,
  imageUrl,
  setImageUrl,
  setUploadReceipt,
  profile,
  onUploading,
}: {
  imageUrl: string | null;
  setImageUrl: (imageUrl: string) => void;
  /** Proof the upload is the caller's own; `updateProfilePicture` requires it. */
  setUploadReceipt: (receipt: string | null) => void;
  size?: "sm" | "md" | "lg";
  profile: BaseProfile;
  onUploading?: (isUploading: boolean) => void;
}) {
  let containerSize = "w-32 h-32";
  if (size === "md") {
    containerSize = "w-60 h-60";
  } else if (size === "lg") {
    containerSize = "w-80 h-80";
  }
  const username = getUserName(profile);
  const fileName = `${username
    .toLowerCase()
    .replaceAll(" ", "_")}_profile_picture`;
  // The receipt signs the exact URL the server saw, which reaches the client
  // separately from the upload response's own `url`. Submit the signed one so
  // the pair always matches.
  const signedUpload = useRef<SignedUpload | null>(null);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={cn("relative mb-4 border border-dashed", containerSize)}>
        <AvatarImage
          alt="avatar"
          src={imageUrl || "/img/placeholders/avatar-placeholder.png"}
        />
      </div>
      <UploadThingImageButton
        endpoint="profilePicture"
        hasImage={Boolean(imageUrl)}
        buttonLabel="Elige una imagen"
        changeLabel="Cambiar imagen"
        onUploading={onUploading}
        transformFiles={(files) =>
          files.map((f) => {
            const fileExtension = f.name.split(".").pop();
            return new File([f], `${fileName}.${fileExtension}`, {
              type: f.type,
            });
          })
        }
        onServerData={(serverData) => {
          signedUpload.current = readSignedUpload(serverData);
        }}
        onUploadComplete={(uploadedUrl) => {
          const signed = signedUpload.current;
          setImageUrl(signed?.imageUrl ?? uploadedUrl);
          setUploadReceipt(signed?.receipt ?? null);
        }}
        successMessage="La imagen se verá en un momento"
        tooLargeMessage="La imagen es demasiado grande. Máximo 4MB."
        errorMessage="Error al subir la imagen"
      />
    </div>
  );
}
