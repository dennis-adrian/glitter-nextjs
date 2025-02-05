"use client";

import { UserCategory } from "@/app/api/users/definitions";
import { Separator } from "@/app/components/ui/separator";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { cn } from "@/app/lib/utils";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

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

  const handleSelectedCategory = (category: UserCategory) => {
    setSelectedCategory(category);
    setSelectedSubcategories([]);
  };

  const handleSelectedSubcategory = (subcategory: Subcategory) => {
    setSelectedSubcategories([...selectedSubcategories, subcategory]);
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
        <div className="flex flex-wrap w-full gap-2 mt-2">
          {categoriesWithLabel.map((category) => (
            <MainCategoryCard
              key={category.category}
              label={category.label}
              selected={selectedCategory === category.category}
              onSelectCategory={() => handleSelectedCategory(category.category)}
              subcategories={filterSubcategories(category.category)}
              selectedSubcategories={selectedSubcategories}
              filterSubcategories={filterSubcategories}
              onSelectSubcategory={handleSelectedSubcategory}
              category={category.category}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const MainCategoryCard = ({
  label,
  onSelectCategory,
  selected,
  subcategories,
  selectedSubcategories,
  filterSubcategories,
  onSelectSubcategory,
  category,
}: {
  label: string;
  onSelectCategory: () => void;
  selected: boolean;
  subcategories: Subcategory[];
  selectedSubcategories: Subcategory[];
  filterSubcategories: (category: UserCategory) => Subcategory[];
  onSelectSubcategory: (subcategory: Subcategory) => void;
  category: UserCategory;
}) => {
  return selected ? (
    <SelectedCategoryCard
      label={label}
      onSelectCategory={onSelectCategory}
      selected={selected}
      subcategories={filterSubcategories(category)}
      selectedSubcategories={selectedSubcategories}
      onSelectSubcategory={onSelectSubcategory}
    />
  ) : (
    <div
      className="text-sm border py-1 px-3 rounded-md cursor-pointer overflow-hidden transition-all hover:border-primary-500 hover:scale-105 focus:border-primary-500 focus:outline-none"
      onClick={onSelectCategory}
    >
      <div>{label}</div>
    </div>
  );
};

const SelectedCategoryCard = ({
  label,
  onSelectCategory,
  onSelectSubcategory,
  selected,
  subcategories,
  selectedSubcategories,
}: {
  label: string;
  onSelectCategory: () => void;
  onSelectSubcategory: (subcategory: Subcategory) => void;
  selected: boolean;
  subcategories: Subcategory[];
  selectedSubcategories: Subcategory[];
}) => {
  return (
    <div className="w-full border rounded-md p-2">
      <div onClick={onSelectCategory}>
        <h2 className="font-semibold mb-1">{label}</h2>
        <div className="flex flex-wrap gap-1">
          {selected &&
            selectedSubcategories.length > 0 &&
            selectedSubcategories.map((subcategory) => (
              <div
                key={subcategory.id}
                className="bg-primary-500 text-sm text-white px-2 py-1 rounded-sm w-fit flex items-center gap-1"
              >
                <span>{subcategory.label}</span>
                <XIcon className="w-4 h-4" />
              </div>
            ))}
        </div>
        <Separator className="my-2" />
      </div>
      <div>
        {selected && (
          <div className="flex text-sm flex-wrap gap-2 cursor-default">
            {subcategories.map((subcategory) => (
              <div
                className="bg-primary-50 py-1 px-2 rounded-sm"
                key={subcategory.id}
                onClick={() => onSelectSubcategory(subcategory)}
              >
                {subcategory.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
