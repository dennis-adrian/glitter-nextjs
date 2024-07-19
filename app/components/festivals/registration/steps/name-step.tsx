import NameForm from "@/app/components/festivals/registration/forms/name";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { NewVisitor } from "@/app/data/visitors/actions";
import { Dispatch, SetStateAction } from "react";

type NameStepProps = {
  updateVisitor: (firstName: string, lastName: string) => void;
};

export default function NameStep(props: NameStepProps) {
  return (
    <>
      <StepDescription
        title="¿Cuál es tu nombre?"
        description="Parece que es la primera vez que visitas uno de nuestros eventos, queremos saber cómo te llamas"
      />
      <NameForm onSubmit={props.updateVisitor} />
    </>
  );
}
