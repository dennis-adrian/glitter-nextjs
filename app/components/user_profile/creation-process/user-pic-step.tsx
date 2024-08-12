import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { Button } from "@/app/components/ui/button";
import ProfilePictureField from "@/app/components/user_profile/profile_pic/field";
import { ArrowRightIcon, RotateCwIcon } from "lucide-react";

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
      <div className="flex flex-col items-center w-full">
        <div className="mb-4">
          <ProfilePictureField profile={props.profile} />
        </div>
        <div className="flex gap-2 my-4 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            <RotateCwIcon className="w-4 h-4 mr-2" />
            Recargar
          </Button>
          <Button
            className="w-full"
            type="button"
            onClick={() => props.setStep(2)}
          >
            Continuar
            <ArrowRightIcon className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </>
  );
}
