"use client";

import { cn } from "@/app/lib/utils";
import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import { BaseProfile } from "@/app/api/users/definitions";
import { getUserName } from "@/app/lib/users/utils";
import { AvatarImage } from "../../ui/avatar";

export default function ProfilePicUpload({
  size,
  imageUrl,
  setImageUrl,
  profile,
  onUploading,
}: {
  imageUrl: string | null;
  setImageUrl: (imageUrl: string) => void;
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
        onUploadComplete={setImageUrl}
        successMessage="La imagen se verá en un momento"
        tooLargeMessage="La imagen es demasiado grande. Máximo 4MB."
        errorMessage="Error al subir la imagen"
      />
    </div>
  );
}
