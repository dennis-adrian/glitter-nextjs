import PhoneForm from "@/app/components/festivals/registration/forms/phone";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";

type PhoneStepProps = {
  updateVisitor: (phoneNumber: string) => void;
};
export default function PhoneStep(props: PhoneStepProps) {
  return (
    <>
      <StepDescription
        title="¿Cuál es tu número de teléfono?"
        description="No te enviaremos spam, no vendemos nada más que eventos llenos de arte. Sólo te avisaremos cuando tengamos algo nuevo que te pueda interesar"
      />
      <PhoneForm onSubmit={props.updateVisitor} />
    </>
  );
}
