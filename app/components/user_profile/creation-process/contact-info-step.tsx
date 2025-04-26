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
        title="Información de contacto"
        description="Esta información será utilizada para contactarte y enviarte información sobre nuestros festivales. No se compartirá con otros participantes o visitantes."
      />
      <ContactInfoForm profile={props.profile} />
    </>
  );
}
