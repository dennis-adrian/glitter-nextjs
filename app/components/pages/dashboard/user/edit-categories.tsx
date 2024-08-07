import { fetchUserProfileById } from "@/app/api/users/actions";
import { Card, CardContent } from "@/app/components/ui/card";
import UpdateCategoriesForm from "@/app/components/users/form/update-categories-form";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";
import { notFound } from "next/navigation";

type EditUserCategoriesPageProps = {
  forProfileId: number;
};
export default async function EditUserCategoriesPage(
  props: EditUserCategoriesPageProps,
) {
  const forProfile = await fetchUserProfileById(props.forProfileId);
  if (!forProfile) return notFound();

  const allSubcategories = await fetchSubcategories();
  const mainCategory = forProfile.profileSubcategories[0]?.subcategory;
  const profileSubcategories = forProfile.profileSubcategories
    .slice(1)
    .map((subcategory) => subcategory.subcategory);

  return (
    <div className="container">
      <h2 className="font-semibold text-center my-2">Categorías Actuales</h2>
      <Card>
        <CardContent className="p-4 flex flex-col items-center justify-center gap-4">
          {mainCategory ? (
            <>
              <div className="flex flex-col gap-1 items-center">
                <h3 className="text-muted-foreground text-sm">
                  Categoría principal
                </h3>
                <span>{mainCategory.label}</span>
              </div>
              {profileSubcategories.length > 0 && (
                <div className="flex flex-col gap-1 items-center">
                  <h4 className="text-muted-foreground text-sm">
                    Subcategorías
                  </h4>
                  <div className="text-sm text-center">
                    {profileSubcategories
                      .map((subcategory) => subcategory.label)
                      .join(" - ")}
                  </div>
                </div>
              )}
            </>
          ) : (
            <h3 className="text-muted-foreground">Sin categorías</h3>
          )}
        </CardContent>
      </Card>
      <h2 className="font-semibold text-center mt-6">Nuevas Categorías</h2>
      <Card className="mb-4 mt-2">
        <CardContent className="p-4 flex flex-col items-center justify-center gap-4">
          <UpdateCategoriesForm
            profile={forProfile}
            subcategories={allSubcategories}
          />
        </CardContent>
      </Card>
    </div>
  );
}
