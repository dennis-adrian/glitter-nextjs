import BaseModal from "@/app/components/modals/base-modal";
import DeleteSubcategoryForm from "@/app/components/subcategories/forms/delete-subcategory";
import { Subcategory } from "@/app/lib/subcategories/definitions";

type DeleteSubcategoryModalProps = {
  subcategory?: Subcategory;
  show: boolean;
  onOpenChange: (open: boolean) => void;
};
export default function DeleteSubcategoryModal(
  props: DeleteSubcategoryModalProps,
) {
  return (
    <BaseModal
      title="Subcategoría eliminada"
      show={props.show}
      onOpenChange={props.onOpenChange}
    >
      {!props.subcategory ? (
        <div>No se seleccionó una subcategoría para eliminar</div>
      ) : (
        <div>
          <div className="flex flex-col gap-2 mb-4 text-center">
            <span>
              ¿Estás seguro que deseas eliminar la subcategoría{" "}
              <span className="font-semibold">{props.subcategory.label}</span>?
            </span>
            <span>Esta acción no se puede deshacer.</span>
          </div>
          <DeleteSubcategoryForm
            subcategoryId={props.subcategory.id}
            onSuccess={() => props.onOpenChange(false)}
          />
        </div>
      )}
    </BaseModal>
  );
}
