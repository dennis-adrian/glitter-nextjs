import BirthdayForm from "@/app/components/festivals/registration/forms/birthday";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";

type BirthdayStepProps = {
  updateVisitor: (birthdate: Date) => void;
};

export default function BirthdayStep(props: BirthdayStepProps) {
  return (
    <>
      <StepDescription
        title="¿Cuándo es tu cumpleaños?"
        description="Queremos conocerte mejor y asegurarnos de ofrecerte la mejor experiencia en nuestros eventos. ¡Gracias por compartirlo con nosotros!"
      />
      <BirthdayForm onSubmit={props.updateVisitor} />
    </>
  );
}
