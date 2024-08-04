import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import PrivateInfoForm from "@/app/components/user_profile/creation-process/private-info-form";

type PrivateInfoStepProps = {
  profile: ProfileType;
  step: number;
  setStep: (step: number) => void;
};
export default function PrivateInfoStep(props: PrivateInfoStepProps) {
  return (
    <>
      <StepDescription
        title="Esta información es muy importante"
        description="Todo lo que compartas en esta sección es privado y no podrá verlo nadie más que el equipo Glitter"
      />
      <PrivateInfoForm
        profile={props.profile}
        onBack={() => props.setStep(props.step - 1)}
        onSubmit={() => {}}
      />
    </>
  );
}
