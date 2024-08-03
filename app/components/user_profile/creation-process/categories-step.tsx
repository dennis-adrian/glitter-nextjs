import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import CategoriesOptions from "@/app/components/user_profile/creation-process/categories-options";
import { Subcategory } from "@/app/lib/subcategories/definitions";

type CategoriesStepProps = {
  profile: ProfileType;
  subcategories: Subcategory[];
  step: number;
  setStep: (step: number) => void;
};
export default function CategoriesStep(props: CategoriesStepProps) {
  return (
    <>
      <StepDescription
        title="¿En qué categoría te gustaría participar?"
        description="Elige la categoría que mejor describa tu perfil o tu negocio"
      />
      <CategoriesOptions
        profile={props.profile}
        subcategories={props.subcategories}
        step={props.step}
        setStep={props.setStep}
      />
    </>
  );
}
