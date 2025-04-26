import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import ProfilePictureForm from "@/app/components/user_profile/profile_pic/form";

type UserPicStepProps = {
  profile: ProfileType;
};
export default function UserPicStep(props: UserPicStepProps) {
  return (
    <>
      <StepDescription
        title="Agrega una nueva foto de perfil"
        description="Esta imagen será la que se mostrará en tu perfil y en los festivales en los que participes."
      />
      <div className="mt-4">
        <ProfilePictureForm profile={props.profile} />
      </div>
    </>
  );
}
