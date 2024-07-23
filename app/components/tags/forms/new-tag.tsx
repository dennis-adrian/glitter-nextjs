import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  label: z
    .string({ required_error: "La etiqueta es requerida" })
    .trim()
    .min(3, { message: "La etiqueta es requerida" }),
  categoryId: z.number().min(1, { message: "La categoría es requerida" }),
});

export default function NewTagForm() {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const action: () => void = form.handleSubmit(async (data) => {});

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={action}>
        <TextInput
          formControl={form.control}
          label="Etiqueta"
          name="label"
          placeholder="Nombre de la etiqueta"
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
