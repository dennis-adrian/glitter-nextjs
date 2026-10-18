import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import UserSocialsForm from "@/app/components/user_profile/creation-process/user-socials-form";

type UserSocialsStepProps = {
  profile: ProfileType;
};
export default function UserSocialsStep(props: UserSocialsStepProps) {
  return (
    <>
      <StepDescription
        title="Agregá al menos una red social"
        description="Agregá al menos tu usuario de Instagram para validar que tu perfil coincide con la categoría que elegiste y para compartirlo con nuestro público."
      />
      <UserSocialsForm profile={props.profile} />
    </>
  );
}
