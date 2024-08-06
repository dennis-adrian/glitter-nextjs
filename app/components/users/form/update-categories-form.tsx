import { ProfileType } from "@/app/api/users/definitions";
import CheckboxInput from "@/app/components/form/fields/checkbox";
import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  mainCategory: z.string({
    required_error: "La categoría principal es requerida",
  }),
  subcategories: z.array(z.string()).optional(),
});

type UpdateCategoriesFormProps = {
  profile: ProfileType;
  subcategories: Subcategory[];
};

export default function UpdateCategoriesForm(props: UpdateCategoriesFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      subcategories: [],
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    console.log(data);
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="flex flex-col gap-4 w-full">
        <SelectInput
          formControl={form.control}
          label="Categoría principal"
          placeholder="Elige una opción"
          name="mainCategory"
          options={props.subcategories.map((subcategory) => ({
            value: subcategory.id.toString(),
            label: subcategory.label,
          }))}
        />
        <CheckboxInput
          label="Categorías adicionales"
          description="No es obligatorio que selecciones alguna de las categorías adicionales"
          name="subcategories"
          formControl={form.control}
          items={props.subcategories.map((subcategory) => ({
            id: subcategory.id.toString(),
            label: subcategory.label,
          }))}
        />
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
        >
          Actualizar categorías
        </SubmitButton>
      </form>
    </Form>
  );
}
