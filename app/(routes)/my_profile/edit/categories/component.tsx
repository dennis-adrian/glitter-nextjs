import { CategoriesStepClient } from "@/app/(routes)/my_profile/edit/categories/step";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

export default async function EditCategories() {
  const profile = await getCurrentUserProfile();
  if (!profile) return notFound();

  const subcategories = await fetchSubcategories();

  if (profile.category !== "entrepreneurship" && profile.role !== "admin") {
    return (
      <div className="container text-muted-foreground text-lg md:text-2xl flex justify-center">
        <span className="mt-20 text-center">
          No tienes permisos para editar tu categoría
        </span>
      </div>
    );
  }

  let filteredSubcategories = subcategories;
  if (profile.role !== "admin") {
    filteredSubcategories = subcategories.filter(
      (subcategory) =>
        subcategory.category === "entrepreneurship" &&
        subcategory.label !== "Sublimación colaborativa",
    );
  }

  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-xl font-bold md:text-2xl">Editar Categoría</h1>
      <p className="text-muted-foreground">
        Esta página estará disponible hasta el 9 de agosto de 2024
      </p>
      <CategoriesStepClient
        profile={profile}
        subcategories={filteredSubcategories}
      />
    </div>
  );
}
