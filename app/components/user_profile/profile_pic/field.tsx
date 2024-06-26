"use client";

import Image from "next/image";

import { CameraIcon, FilePenLineIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";

import Modal from "@/components/user_profile/modal";
import Form from "./form";
import { Badge } from "@/app/components/ui/badge";

const ProfilePictureField = ({ profile }: { profile: ProfileType }) => {
  return (
    <div className="relative group flex justify-center">
      <div className="relative w-32 h-32 rounded-full bg-gray-200">
        <Image
          src={profile?.imageUrl || `/img/profile-avatar.png`}
          alt="Imagen de perfil"
          fill
          sizes="150px, 150px"
          className="rounded-full object-cover"
          blurDataURL="/img/profile-avatar.png"
        />
      </div>
      {profile.category === "new_artist" && (
        <div className="absolute -bottom-2">
          <Badge className="bg-white text-foreground" variant="outline">
            Nuevo
          </Badge>
        </div>
      )}
      <Modal
        title="Editar Imagen de Perfil"
        profile={profile}
        FormComponent={Form}
      >
        <div>
          <div
            className="absolute inset-0 w-full h-full flex items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            <div className="flex flex-col gap-1 justify-center items-center absolute inset-0 m-auto text-white">
              <CameraIcon className="w-6 h-6" />
              Editar
            </div>
          </div>
          <div className="absolute right-0 bottom-0">
            <FilePenLineIcon className="w-5 h-5" />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProfilePictureField;
