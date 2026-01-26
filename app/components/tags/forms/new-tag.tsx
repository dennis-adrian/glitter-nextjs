import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { createTag } from "@/app/lib/tags/actions";
import { userCategoryOptions, userOccupationsLabel } from "@/app/lib/utils";
import { userCategoryEnum } from "@/db/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
  label: z
    .string({
        error: (issue) => issue.input === undefined ? "La etiqueta es requerida" : undefined
    })
    .trim()
    .min(3, {
        error: "La etiqueta es requerida"
    }),
  category: z.enum(userCategoryEnum.enumValues),
});

type NewTagFormProps = {
  onSuccess: () => void;
};
export default function NewTagForm(props: NewTagFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      label: "",
      category: "illustration",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await createTag(data);

    if (res.success) {
      toast.success(res.message);
      props.onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={action}>
        <TextInput
          formControl={form.control}
          label="Etiqueta"
          name="label"
          placeholder="Nombre de la etiqueta"
        />
        <SelectInput
          formControl={form.control}
          label="Categoría"
          name="category"
          options={userOccupationsLabel}
          placeholder="Elige una opción"
        />
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
        >
          Confirmar
        </SubmitButton>
      </form>
    </Form>
  );
}
