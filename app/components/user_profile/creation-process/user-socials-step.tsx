import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import UserSocialsForm from "@/app/components/user_profile/creation-process/user-socials-form";

type UserSocialsStepProps = {
  profile: ProfileType;
  step: number;
  setStep: (step: number) => void;
};
export default function UserSocialsStep(props: UserSocialsStepProps) {
  return (
    <>
      <StepDescription
        title="¿Cuáles son tus redes sociales?"
        description="Usaremos tus redes sociales para validar que tu perfil coincide con la categoria que elegiste y para compartirlas con nuestro público"
      />
      <UserSocialsForm
        profile={props.profile}
        onBack={() => props.setStep(props.step - 1)}
        onSubmit={() => props.setStep(props.step + 1)}
      />
    </>
  );
}
