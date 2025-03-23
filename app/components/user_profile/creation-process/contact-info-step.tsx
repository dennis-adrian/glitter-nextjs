import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import ContactInfoForm from "@/app/components/user_profile/creation-process/contact-info-form";

type ContactInfoStepProps = {
  profile: ProfileType;
};
export default function ContactInfoStep(props: ContactInfoStepProps) {
  return (
    <>
      <StepDescription
        title="Datos personales"
        description="Esta información será utilizada para identificar tu cuenta y no será compartida con otros participantes o visitantes."
      />
      <ContactInfoForm
        profile={props.profile}
      />
    </>
  );
}
