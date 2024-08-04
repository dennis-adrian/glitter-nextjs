import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { deleteTag } from "@/app/lib/tags/actions";
import { Tag } from "@/app/lib/tags/definitions";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function DeleteTagForm({
  tagId,
  onSuccess,
}: {
  tagId: number;
  onSuccess: () => void;
}) {
  const form = useForm();
  const action: () => void = form.handleSubmit(async () => {
    const res = await deleteTag(tagId);
    if (res.success) {
      toast.success(res.message);
      onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="w-full">
        <div className="flex flex-col gap-4">
          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            Eliminar subcategoría
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
