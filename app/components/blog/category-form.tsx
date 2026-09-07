"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import {
  createPostCategory,
  updatePostCategory,
} from "@/app/lib/posts/actions";
import type { PostCategoryRow } from "@/app/lib/posts/definitions";
import { postCategoryFormSchema } from "@/app/lib/posts/validate";
import { useRouter } from "next/navigation";

type Props = {
  category?: PostCategoryRow;
  onDone?: () => void;
};

export default function CategoryForm({ category, onDone }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const form = useForm<z.infer<typeof postCategoryFormSchema>>({
    resolver: zodResolver(postCategoryFormSchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
    },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    setBusy(true);
    try {
      const res = category
        ? await updatePostCategory(category.id, data)
        : await createPostCategory(data);

      if (res.success) {
        toast.success(category ? "Categoría actualizada" : "Categoría creada");
        if (!category) form.reset({ name: "", description: "" });
        onDone?.();
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4">
        <TextInput name="name" label="Nombre" required />
        <TextareaInput
          formControl={form.control}
          name="description"
          label="Descripción"
          placeholder="Opcional"
          maxLength={280}
        />
        <Button type="submit" disabled={busy}>
          {category ? "Guardar cambios" : "Crear categoría"}
        </Button>
      </form>
    </Form>
  );
}
