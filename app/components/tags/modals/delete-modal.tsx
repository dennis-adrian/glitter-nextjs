import BaseModal from "@/app/components/modals/base-modal";
import DeleteTagForm from "@/app/components/tags/forms/delete-tag";
import { Tag } from "@/app/lib/tags/definitions";

type DeleteTagModalProps = {
  tag?: Tag;
  show: boolean;
  onOpenChange: (open: boolean) => void;
};
export default function DeleteTagModal(props: DeleteTagModalProps) {
  return (
    <BaseModal
      title="Eliminar etiqueta"
      show={props.show}
      onOpenChange={props.onOpenChange}
    >
      {!props.tag ? (
        <div>No se seleccionó una etiqueta para eliminar</div>
      ) : (
        <div>
          <div className="flex flex-col gap-2 mb-4 text-center">
            <span>
              ¿Estás seguro que deseas eliminar la etiqueta{" "}
              <span className="font-semibold">{props.tag.label}</span>?
            </span>
            <span>Esta acción no se puede deshacer.</span>
          </div>
          <DeleteTagForm
            tagId={props.tag.id}
            onSuccess={() => props.onOpenChange(false)}
          />
        </div>
      )}
    </BaseModal>
  );
}
