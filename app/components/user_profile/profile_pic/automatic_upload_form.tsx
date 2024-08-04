"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { cn } from "@/app/lib/utils";
import { UploadButton } from "@/app/vendors/uploadthing";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

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
  profile,
  size,
  onSuccess,
}: {
  afterUploadComponent?: React.ReactNode;
  profile: ProfileType;
  size?: "sm" | "md" | "lg";
  onSuccess?: () => void;
}) {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  let containerSize = "w-32 h-32";
  if (size === "md") {
    containerSize = "w-60 h-60";
  } else if (size === "lg") {
    containerSize = "w-80 h-80";
  }

  return (
    <div className="flex flex-col items-center justify-center">
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
      <UploadButton
        content={{
          button({ ready, isUploading, uploadProgress }) {
            if (isUploading && uploadProgress === 100) {
              return (
                <Loader2Icon className="w-4 h-4 text-primary-500 animate-spin" />
              );
            }
            if (isUploading) return <div>{uploadProgress}%</div>;
            if (ready) return <div>Elige una imagen</div>;
            return "Cargando...";
          },
          allowedContent({ ready, isUploading }) {
            if (!ready) return null;
            if (isUploading) return "Subiendo imagen...";
            return "Imagen hasta 2MB";
          },
        }}
        appearance={{
          button: ({ ready, isUploading }) => {
            if (!ready) {
              return "bg-transparent text-xs text-muted-foreground border";
            }
            if (isUploading) {
              return "bg-transparent text-xs text-muted-foreground border after:bg-primary-400/60";
            }
            return "bg-transparent text-xs text-foreground border hover:text-primary-500 hover:border-primary-500";
          },
        }}
        endpoint="profilePicture"
        onClientUploadComplete={async (res) => {
          const serverData = res[0].serverData;
          const { profileId, imageUrl } = serverData.results;
          const response = await updateProfile(profileId, imageUrl);
          if (response.success) {
            toast.success("Imagen actualizada correctamente", {
              cancel: true,
              description:
                "Los cambios se aplicarán en breve. O recarga la página",
            });
            setUploadedImageUrl(imageUrl);
            if (onSuccess) onSuccess();
          } else {
            toast.error(response.message);
          }
        }}
        onUploadError={(error: Error) => {
          toast.error("Error al subir la imagen");
        }}
      />
    </div>
  );
}
