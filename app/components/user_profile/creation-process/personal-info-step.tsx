import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import PersonalInfoForm from "@/app/components/user_profile/creation-process/personal-info-form";

type PersonalInfoStepProps = {
  profile: ProfileType;
};
export default function PersonalInfoStep(props: PersonalInfoStepProps) {
  return (
    <>
      <StepDescription
        title="Datos personales"
        description="Esta información será utilizada para identificar tu cuenta y no será compartida con otros participantes o visitantes."
      />
      <PersonalInfoForm
        profile={props.profile}
      />
    </>
  );
}
