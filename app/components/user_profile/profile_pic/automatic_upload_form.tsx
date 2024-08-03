"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { cn } from "@/app/lib/utils";
import { UploadButton } from "@/app/vendors/uploadthing";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

type ResponseType = {
  success: boolean;
  message: string;
};

async function updateProfile(profileId: number, imageUrl: string) {
  const res = await fetch("/api/users", {
    method: "PUT",
    body: JSON.stringify({
      profileId,
      imageUrl,
    }),
  });
  return (await res.json()) as ResponseType;
}

export default function AutomaticProfilePicUploadForm({
  afterUploadComponent,
  profile,
  size,
  onSuccess,
}: {
  afterUploadComponent?: React.ReactNode;
  profile: ProfileType;
  size?: "sm" | "md" | "lg";
  onSuccess?: () => void;
}) {
  const [showUploadButton, setShowUploadButton] = useState(true);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  let containerSize = "w-32 h-32";
  if (size === "md") {
    containerSize = "w-60 h-60";
  } else if (size === "lg") {
    containerSize = "w-80 h-80";
  }

  return (
    <>
      <div className={cn("relative mb-4 border border-dashed", containerSize)}>
        <Image
          className="object-cover"
          alt="Imagen de perfil"
          src={
            uploadedImageUrl || profile.imageUrl || "/img/profile-avatar.png"
          }
          sizes="240px, 240px"
          fill
        />
      </div>
      {showUploadButton ? (
        <UploadButton
          endpoint="profilePicture"
          onClientUploadComplete={async (res) => {
            const serverData = res[0].serverData;
            const { profileId, imageUrl } = serverData.results;
            const response = await updateProfile(profileId, imageUrl);
            if (response.success) {
              toast.success("Imagen actualizada correctamente", {
                description: "Los cambios se aplicarán en breve",
              });
              setUploadedImageUrl(imageUrl);
              if (onSuccess) onSuccess();
              setShowUploadButton(false);
            } else {
              toast.error(response.message);
            }
          }}
          onUploadError={(error: Error) => {
            toast.error("Error al subir la imagen");
          }}
        />
      ) : (
        afterUploadComponent || null
      )}
    </>
  );
}
