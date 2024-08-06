import { ProfileType } from "@/app/api/users/definitions";
import BaseModal from "@/app/components/modals/base-modal";
import { Card, CardContent } from "@/app/components/ui/card";
import CategoriesForm from "@/app/components/user_profile/creation-process/categories-form";
import CategoriesOptions from "@/app/components/user_profile/creation-process/categories-options";
import CategoriesStep from "@/app/components/user_profile/creation-process/categories-step";
import UpdateCategoriesForm from "@/app/components/users/form/update-categories-form";

type UpdateCategoriesModalProps = {
  profile: ProfileType;
  open: boolean;
  setOpen: (open: boolean) => void;
};
export default function UpdateCategoriesModal(
  props: UpdateCategoriesModalProps,
) {
  const mainCategory = props.profile.profileSubcategories[0]?.subcategory;
  const subcategories = props.profile.profileSubcategories
    .slice(1)
    .map((ps) => ps.subcategory);

  return (
    <BaseModal
      title={`Editar categorías de ${props.profile.displayName}`}
      show={props.open}
      onOpenChange={props.setOpen}
    >
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
              {subcategories.length > 0 && (
                <div className="flex flex-col gap-1 items-center">
                  <h4 className="text-muted-foreground text-sm">
                    Subcategorías
                  </h4>
                  <div className="text-sm text-center">
                    {subcategories
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
      <h2 className="font-semibold text-center mt-6 mb-2">Nuevas Categorías</h2>
      <Card>
        <CardContent className="p-4 flex flex-col items-center justify-center gap-4">
          <UpdateCategoriesForm
            profile={props.profile}
            subcategories={subcategories}
          />
        </CardContent>
      </Card>
    </BaseModal>
  );
}
