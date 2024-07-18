import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";
import StepDescription from "@/app/components/festivals/registration/steps/step-decription";

type RegistrationTypeStepProps = {
  festivalId: number;
  type?: "individual" | "family";
};

export default function RegistrationTypeStep(props: RegistrationTypeStepProps) {
  return (
    <>
      {!props.type && (
        <StepDescription
          title="¿Cómo vienes al evento?"
          description="Elige la opción que mejor refleje tu situación"
        />
      )}
      <RegistrationTypeCards
        festivalId={props.festivalId}
        selectedType={props.type}
      />
    </>
  );
}
