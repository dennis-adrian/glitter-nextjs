import { Button } from "@/app/components/ui/button";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { useState } from "react";

type CategoriesFormProps = {
  subcategories: Subcategory[];
};

export default function CategoriesForm(props: CategoriesFormProps) {
  const [mainCategory, setMainCategory] = useState<Subcategory | null>(null);
  const [availableCategories, setAvailableCategories] = useState<Subcategory[]>(
    props.subcategories,
  );
  const [additionalCategories, setAdditionalCategories] = useState<
    Subcategory[]
  >([]);

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
      <div className="text-center">
        <div className="flex flex-col min-w-80 min-h-44 p-5 justify-center items-center mx-auto gap-5 border rounded-lg">
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
      </div>
    );
  }

  return (
    <CategoriesCard
      subcategories={availableCategories}
      onClick={handleSelectCategory}
    />
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
    <div className="flex flex-wrap gap-4">
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
