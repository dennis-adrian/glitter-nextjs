"use client";

import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { updateProfileCategories } from "@/app/lib/users/actions";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type CategoriesFormProps = {
  profile: ProfileType;
  mainCategory: Subcategory | null;
  additionalCategories: Subcategory[];
  onBack: () => void;
  onSubmit: () => void;
};

export default function CategoriesForm(props: CategoriesFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    if (!props.mainCategory) return;

    const subcategories = [props.mainCategory, ...props.additionalCategories];
    const res = await updateProfileCategories(
      props.profile.id,
      props.mainCategory?.category as UserCategory,
      subcategories.map((subcategory) => subcategory.id),
    );

    if (res.success) {
      toast.success(res.message);
      props.onSubmit();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="w-full flex flex-col gap-4 my-4" onSubmit={action}>
        <div className="flex justify-end items-center gap-2">
          <Button type="button" variant="outline" onClick={props.onBack}>
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <SubmitButton
            disabled={!props.mainCategory || form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            <span>Continuar</span>
            <ArrowRightIcon className="ml-2 w-4 h-4" />
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
