import { ProfileType } from "@/app/api/users/definitions";
import { Button } from "@/app/components/ui/button";
import CategoriesForm from "@/app/components/user_profile/creation-process/categories-form";
import { getInitialAvailableCategories } from "@/app/components/user_profile/creation-process/helpers";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { useState } from "react";

type CategoriesOptionsProps = {
  profile: ProfileType;
  subcategories: Subcategory[];
  step: number;
  setStep: (step: number) => void;
};

export default function CategoriesOptions(props: CategoriesOptionsProps) {
  const step = props.step;
  const [mainCategory, setMainCategory] = useState<Subcategory | null>(
    props.profile.profileSubcategories[0]?.subcategory,
  );
  const [availableCategories, setAvailableCategories] = useState<Subcategory[]>(
    getInitialAvailableCategories(
      props.profile.profileSubcategories.map(
        (subcategory) => subcategory.subcategory,
      ),
      props.subcategories,
    ),
  );
  const [additionalCategories, setAdditionalCategories] = useState<
    Subcategory[]
  >(
    props.profile.profileSubcategories
      .slice(1)
      .map((subcategory) => subcategory.subcategory),
  );

  function handleSelectCategory(mainCategory: Subcategory) {
    setMainCategory(mainCategory);
    setAvailableCategories(
      props.subcategories.filter(
        (subcategory) =>
          subcategory.id !== mainCategory.id &&
          subcategory.category === "entrepreneurship" &&
          subcategory.label !== "Skincare",
      ),
    );
  }

  function handleSubcategoryClick(subcategory: Subcategory) {
    const newAdditionalCategories = [...additionalCategories, subcategory];
    setAdditionalCategories(newAdditionalCategories);
    const newAvailableCategories = availableCategories.filter(
      (category) =>
        category.id !== subcategory.id &&
        subcategory.category === "entrepreneurship",
    );
    setAvailableCategories(newAvailableCategories);
  }

  if (mainCategory) {
    return (
      <div className="text-center w-full">
        <div className="flex flex-col w-full min-h-44 p-5 justify-center items-center mx-auto gap-5 border rounded-lg">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Categoría</span>
            <span className="font-semibold text-xl">{mainCategory.label}</span>
          </div>
          {mainCategory.category === "entrepreneurship" &&
            additionalCategories.length > 0 && (
              <div className="flex flex-col">
                <span className="text-muted-foreground">
                  Categoría adicionales
                </span>
                {additionalCategories
                  .map((subcategory) => subcategory.label)
                  .join(" - ")}
              </div>
            )}
        </div>
        {mainCategory.category === "entrepreneurship" &&
          mainCategory.label !== "Skincare" &&
          availableCategories.length > 0 && (
            <div className="flex flex-col my-6">
              <span className="font-semibold text-lg">
                ¿Te gustaría agregar categorías adicionales?
              </span>
              <span className="text-muted-foreground text-sm">
                En los eventos no podrás ofrecer productos que no estén dentro
                de tus categorías
              </span>
              <div className="my-4">
                <CategoriesCard
                  subcategories={availableCategories}
                  onClick={handleSubcategoryClick}
                />
              </div>
            </div>
          )}
        <CategoriesForm
          profile={props.profile}
          mainCategory={mainCategory}
          additionalCategories={additionalCategories}
          onBack={() => props.setStep(step - 1)}
          onSubmit={() => props.setStep(step + 1)}
        />
      </div>
    );
  }

  return (
    <>
      <CategoriesCard
        subcategories={availableCategories}
        onClick={handleSelectCategory}
      />
      <CategoriesForm
        profile={props.profile}
        mainCategory={mainCategory}
        additionalCategories={additionalCategories}
        onBack={() => props.setStep(step - 1)}
        onSubmit={() => props.setStep(step + 1)}
      />
    </>
  );
}

function CategoriesCard({
  subcategories,
  onClick,
}: {
  subcategories: Subcategory[];
  onClick: (subcategory: Subcategory) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4 border rounded-lg p-6 w-full">
      {subcategories.map((subcategory) => (
        <Button
          className="border py-2 px-4 rounded-lg cursor-pointer overflow-hidden transition-all hover:border-primary-500 hover:scale-105 focus:border-primary-500 focus:outline-none"
          key={subcategory.id}
          variant="ghost"
          onClick={() => onClick(subcategory)}
        >
          {subcategory.label}
        </Button>
      ))}
    </div>
  );
}
