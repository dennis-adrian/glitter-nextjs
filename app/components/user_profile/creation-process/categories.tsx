"use client";

import { UserCategory } from "@/app/api/users/definitions";
import Tag from "@/app/components/molecules/tag";
import { Separator } from "@/app/components/ui/separator";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { useState } from "react";

const categoriesWithLabel: {
  category: UserCategory;
  label: string;
}[] = [
  {
    category: "illustration",
    label: "Ilustración",
  },
  {
    category: "entrepreneurship",
    label: "Emprendimientos creativos",
  },
  {
    category: "gastronomy",
    label: "Gastronomía",
  },
];

type CategoriesProps = {
  subcategories: Subcategory[];
};

export default function Categories({ subcategories }: CategoriesProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<UserCategory>("none");
  const [selectedSubcategories, setSelectedSubcategories] = useState<
    Subcategory[]
  >([]);

  const handleSelectCategory = (category: UserCategory) => {
    if (category !== selectedCategory) {
      setSelectedSubcategories([]);
    }
    setSelectedCategory(category);
  };

  const filterSubcategories = (category: UserCategory) => {
    return subcategories.filter(
      (subcategory) =>
        subcategory.category === category &&
        !selectedSubcategories.map((sub) => sub.id).includes(subcategory.id),
    );
  };

  return (
    <div className="my-3">
      <h3 className="md:text-lg font-semibold">
        ¿En qué categoría te gustaría participar?
      </h3>
      <p className="text-muted-foreground text-sm md:text-base">
        Elige la categoría que mejor describa tu perfil o tu negocio
      </p>
      <div className="border-2 rounded-lg p-3 shadow-md mt-2">
        <p className="text-sm md:text-base leading-4 md:leading-5">
          Selecciona una opción para ver las categorías disponibles
        </p>
        <div className="flex flex-wrap w-full gap-2 mt-3">
          {categoriesWithLabel.map((category) => {
            return selectedCategory === category.category ? (
              <SelectedCategoryCard
                key={category.category}
                label={category.label}
                selected={selectedCategory === category.category}
                subcategories={filterSubcategories(category.category)}
                selectedSubcategories={selectedSubcategories}
                onSelectSubcategory={(subcategories: Subcategory[]) =>
                  setSelectedSubcategories(subcategories)
                }
              />
            ) : (
              <MainCategoryCard
                key={category.category}
                label={category.label}
                onSelectCategory={() => handleSelectCategory(category.category)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const MainCategoryCard = ({
  label,
  onSelectCategory,
}: {
  label: string;
  onSelectCategory: () => void;
}) => {
  return (
    <div
      className="font-medium border py-1 px-3 rounded-md cursor-pointer overflow-hidden transition-all hover:border-primary-500 hover:scale-105 focus:border-primary-500 focus:outline-none"
      onClick={onSelectCategory}
    >
      <div>{label}</div>
    </div>
  );
};

const SelectedCategoryCard = ({
  label,
  onSelectSubcategory,
  selected,
  subcategories,
  selectedSubcategories,
}: {
  label: string;
  onSelectSubcategory: (subcategories: Subcategory[]) => void;
  selected: boolean;
  subcategories: Subcategory[];
  selectedSubcategories: Subcategory[];
}) => {
  const handleAddSubcategory = (subcategory: Subcategory) => {
    onSelectSubcategory([...selectedSubcategories, subcategory]);
  };

  const handleRemoveSubcategory = (subcategory: Subcategory) => {
    onSelectSubcategory(
      selectedSubcategories.filter((sub) => sub.id !== subcategory.id),
    );
  };

  return (
    <div className="w-full border rounded-md p-2">
      <div>
        <h2 className="font-semibold">{label}</h2>
        {selected && (
          <div className="text-sm text-muted-foreground mb-1">
            Categorías seleccionadas ({selectedSubcategories.length})
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {selected &&
            selectedSubcategories.length > 0 &&
            selectedSubcategories.map((subcategory) => (
              <Tag
                key={subcategory.id}
                content={subcategory.label}
                removable
                onRemove={() => handleRemoveSubcategory(subcategory)}
              />
            ))}
        </div>
        <Separator className="my-2" />
      </div>
      <div>
        {selected && (
          <div className="flex text-sm flex-wrap gap-2 cursor-default">
            {subcategories.map((subcategory) => (
              <Tag
                key={subcategory.id}
                content={subcategory.label}
                className="bg-primary-50 py-1 px-2 rounded-sm text-foreground"
                onClick={() => handleAddSubcategory(subcategory)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
