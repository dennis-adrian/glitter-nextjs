import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import CategoriesOptions from "@/app/components/user_profile/creation-process/categories-options";
import SubcategoriesModal from "@/app/components/user_profile/creation-process/subcategories-modal";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { useState } from "react";

type CategoriesStepProps = {
  profile: ProfileType;
  subcategories: Subcategory[];
  step: number;
  setStep: (step: number) => void;
};
export default function CategoriesStep(props: CategoriesStepProps) {
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  return (
    <>
      <StepDescription
        title="¿En qué categoría te gustaría participar?"
        description="Elige la categoría que mejor describa tu perfil o tu negocio"
      />
      <span className="text-muted-foreground text-sm mb-4 flex flex-wrap justify-center gap-1">
        Para saber más sobre las categorías,{" "}
        <span
          className="text-blue-500 underline cursor-pointer"
          onClick={() => setCategoriesModalOpen(true)}
        >
          haz clic aquí
        </span>
      </span>
      <CategoriesOptions
        profile={props.profile}
        subcategories={props.subcategories}
        step={props.step}
        setStep={props.setStep}
      />
      <SubcategoriesModal
        open={categoriesModalOpen}
        setOpen={setCategoriesModalOpen}
      />
    </>
  );
}
