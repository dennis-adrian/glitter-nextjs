"use client";

import { CameraIcon, FilePenLineIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";

import Modal from "@/components/user_profile/modal";
import Form from "./form";
import ProfileAvatar from "@/app/components/common/profile-avatar";

const ProfilePictureField = ({ profile }: { profile: ProfileType }) => {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group flex justify-center">
        <ProfileAvatar className="h-32 w-32" profile={profile} />
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
      <span className="text-xs text-center text-muted-foreground">
        Haz clic en la imagen para editarla
      </span>
    </div>
  );
};

export default ProfilePictureField;
