import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { Button } from "@/app/components/ui/button";
import AutomaticProfilePicUploadForm from "@/app/components/user_profile/profile_pic/automatic_upload_form";

type UserPicStepProps = {
  setStep: (step: number) => void;
  profile: ProfileType;
};
export default function UserPicStep(props: UserPicStepProps) {
  return (
    <>
      <StepDescription
        title="¿Esta imagen es la correcta para tu perfil?"
        description="Ayuda a las personas que ingresan a nuestra página a reconocerte con tu foto de perfil"
      />
      <AutomaticProfilePicUploadForm
        afterUploadComponent={
          <div className="flex gap-4">
            <Button onClick={() => window.location.reload()} variant="outline">
              Reemplazar
            </Button>
            <Button onClick={() => props.setStep(2)}>Continuar</Button>
          </div>
        }
        profile={props.profile}
        size="md"
      />
    </>
  );
}
