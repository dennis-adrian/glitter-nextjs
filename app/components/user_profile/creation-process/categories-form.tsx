"use client";

import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { updateProfileCategories } from "@/app/lib/users/actions";
import { ArrowDownToLineIcon, SaveIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type CategoriesFormProps = {
  category: UserCategory;
  subcategories: Subcategory[];
  profile: ProfileType;
};

export default function CategoriesForm(props: CategoriesFormProps) {
  const form = useForm();

  const action = form.handleSubmit(async () => {
    const res = await updateProfileCategories(
      props.profile.id,
      props.category,
      props.subcategories.map((subcategory) => subcategory.id),
    );

    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action}>
        <SubmitButton
          loading={
            form.formState.isSubmitting || form.formState.isSubmitSuccessful
          }
          className="w-40"
          disabled={
            form.formState.isSubmitting ||
            form.formState.isSubmitSuccessful ||
            !props.category ||
            props.subcategories.length === 0
          }
          loadingLabel="Guardando"
        >
          Guardar
          <ArrowDownToLineIcon className="w-4 h-4 ml-2" />
        </SubmitButton>
      </form>
    </Form>
  );
}
