import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import DisplayNameForm from "@/app/components/user_profile/creation-process/display-name-form";

type DisplayNameStepProps = {
  profile: ProfileType;
  step: number;
  setStep: (step: number) => void;
};
export default function DisplayNameStep(props: DisplayNameStepProps) {
  const step = props.step;
  return (
    <>
      <StepDescription
        title="¿Cómo te reconoce tu público?"
        description="Agrega un nombre reconocible para tu público y una bio para compartir tus intereses"
      />
      <DisplayNameForm
        profile={props.profile}
        onBack={() => props.setStep(step - 1)}
        onSubmit={() => props.setStep(step + 1)}
      />
    </>
  );
}
