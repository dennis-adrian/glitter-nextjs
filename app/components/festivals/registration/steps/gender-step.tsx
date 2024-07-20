import GenderForm from "@/app/components/festivals/registration/forms/gender";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { NewVisitor } from "@/app/data/visitors/actions";

type GenderStepProps = {
  festival: FestivalWithDates;
  numberOfVisitors?: number;
};

export default function GenderStep(props: GenderStepProps) {
  return (
    <>
      <StepDescription
        title="¿Cómo te identificas?"
        description="Queremos crear un ambiente donde todas las personas se sientan cómodas. Elige la opción que más te identifique"
      />
      <GenderForm
        festival={props.festival}
        numberOfVisitors={props.numberOfVisitors}
      />
    </>
  );
}
