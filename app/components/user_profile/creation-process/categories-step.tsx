import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import CategoriesForm from "@/app/components/user_profile/creation-process/categories-form";
import { Subcategory } from "@/app/lib/subcategories/definitions";

type CategoriesStepProps = {
  profile: ProfileType;
  subcategories: Subcategory[];
  step: number;
};
export default function CategoriesStep(props: CategoriesStepProps) {
  return (
    <>
      <StepDescription
        title="¿En qué categoría te gustaría participar?"
        description="Elige la categoría que mejor describa tu perfil o tu negocio"
      />
      <CategoriesForm subcategories={props.subcategories} />
    </>
  );
}
