"use client";

import { cn } from "@/app/lib/utils";
import { UploadButton } from "@/app/vendors/uploadthing";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { BaseProfile } from "@/app/api/users/definitions";
import { getUserName } from "@/app/lib/users/utils";
import { twMerge } from "tailwind-merge";

export default function ProfilePicUpload({
  size,
  imageUrl,
  setImageUrl,
  profile,
}: {
  imageUrl: string | null;
  setImageUrl: (imageUrl: string) => void;
  size?: "sm" | "md" | "lg";
  profile: BaseProfile;
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
        <Image
          className="object-cover"
          alt="Imagen de perfil"
          src={imageUrl || "/img/profile-avatar.png"}
          sizes="240px, 240px"
          fill
        />
      </div>
      <UploadButton
        config={{ cn: twMerge }}
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
        onBeforeUploadBegin={(files) => {
          // Preprocess files before uploading (e.g. rename them)
          return files.map((f) => {
            const fileExtension = f.name.split(".").pop();
            return new File([f], `${fileName}.${fileExtension}`, {
              type: f.type,
            });
          });
        }}
        onClientUploadComplete={async (res) => {
          const serverData = res[0].serverData;
          const { results } = serverData;
          if (results.imageUrl) {
            toast.success("La imagen se verá en un momento");
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
