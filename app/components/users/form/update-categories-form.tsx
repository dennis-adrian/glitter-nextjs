"use client";

import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import CheckboxInput from "@/app/components/form/fields/checkbox";
import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { updateProfileCategories } from "@/app/lib/users/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
  const router = useRouter();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      subcategories: [],
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const mainCategory = props.subcategories.find(
      (subcategory) => subcategory.id === Number(data.mainCategory),
    );

    if (!mainCategory) return;
    const newSubcategoriesIds = [mainCategory.id];
    if (data.subcategories && data.subcategories.length > 0) {
      newSubcategoriesIds.push(...data.subcategories.map((id) => Number(id)));
    }

    const res = await updateProfileCategories(
      props.profile.id,
      mainCategory?.category as UserCategory,
      newSubcategoriesIds,
    );

    if (res.success) {
      toast.success(res.message);
      router.back();
    } else {
      toast.error(res.message);
    }
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
