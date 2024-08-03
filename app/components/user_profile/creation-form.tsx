"use client";

import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import AutomaticProfilePicUploadForm from "@/app/components/user_profile/profile_pic/automatic_upload_form";

type ProfileCreationFormProps = {
  profile: ProfileType;
};
export default function ProfileCreationForm(props: ProfileCreationFormProps) {
  return (
    <div className="flex flex-col items-center">
      <h1 className="font-semibold text-2xl">Completando tu perfil</h1>
      <StepDescription
        title="¿Esta imagen es la correcta para tu perfil?"
        description="Ayuda a las personas que ingresan a nuestra página a reconocerte con tu foto de perfil"
      />
      <AutomaticProfilePicUploadForm profile={props.profile} size="md" />
    </div>
  );
}
