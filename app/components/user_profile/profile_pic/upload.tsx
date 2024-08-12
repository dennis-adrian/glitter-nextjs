"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { cn } from "@/app/lib/utils";
import { UploadButton } from "@/app/vendors/uploadthing";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

export default function ProfilePicUpload({
  size,
  imageUrl,
  setImageUrl,
}: {
  imageUrl: string | null;
  setImageUrl: (imageUrl: string) => void;
  size?: "sm" | "md" | "lg";
}) {
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
          src={imageUrl || "/img/profile-avatar.png"}
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
          const { results } = serverData;
          if (results.imageUrl) {
            setImageUrl(results.imageUrl);
          }
        }}
        onUploadError={(error: Error) => {
          toast.error("Error al subir la imagen");
        }}
      />
    </div>
  );
}
