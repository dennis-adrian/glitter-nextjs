"use client";

import { ProfileType } from "@/app/api/users/definitions";
import { UploadButton } from "@/app/vendors/uploadthing";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

export default function AutomaticProfilePicUploadForm({
  profile,
  size,
}: {
  profile: ProfileType;
  size?: "sm" | "md" | "lg";
}) {
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0.0);
  console.log("props profile", profile);

  return (
    <>
      <div className="relative w-60 h-60 mb-4">
        <Image
          className="object-cover"
          alt="Imagen de perfil"
          src={profile.imageUrl || "/img/profile-avatar.png"}
          sizes="240px, 240px"
          fill
        />
      </div>
      <UploadButton
        endpoint="profilePicture"
        onClientUploadComplete={(res) => {
          setShowProgress(false);
          toast.success("Imagen subida correctamente");
          window.location.reload();
        }}
        onUploadError={(error: Error) => {
          setShowProgress(false);
          toast.error("Error al subir la imagen");
        }}
        onUploadProgress={(progress) => {
          setProgress(progress);
          setShowProgress(true);
        }}
      />
    </>
  );
}
