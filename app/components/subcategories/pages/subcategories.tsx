import NewSubcategory from "@/app/components/subcategories/new-subcategory";
import SubcategoriesCard from "@/app/components/subcategories/organisms/subcategories-card";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";

export default async function SubcategoriesPage() {
  const subcategories = await fetchSubcategories();
  const illustrationSubcategories = subcategories.filter(
    (subcategory) =>
      subcategory.category === "illustration" ||
      subcategory.category === "new_artist",
  );
  const entrepreneurshipSubcategories = subcategories.filter(
    (subcategory) => subcategory.category === "entrepreneurship",
  );
  const gastronomySubcategories = subcategories.filter(
    (subcategory) => subcategory.category === "gastronomy",
  );

  return (
    <div className="container p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="mb-2 text-2xl font-bold md:text-4xl">Subcategorías</h1>
        <NewSubcategory />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 my-4">
        {illustrationSubcategories.length > 0 && (
          <SubcategoriesCard
            title="Subcategorías para ilustradores"
            subcategories={illustrationSubcategories}
          />
        )}
        {entrepreneurshipSubcategories.length > 0 && (
          <SubcategoriesCard
            title="Subcategorías para emprendimientos artísticos"
            subcategories={entrepreneurshipSubcategories}
          />
        )}
        {gastronomySubcategories.length > 0 && (
          <SubcategoriesCard
            title="Subcategorías para gastronomía"
            subcategories={gastronomySubcategories}
          />
        )}
      </div>
    </div>
  );
}
