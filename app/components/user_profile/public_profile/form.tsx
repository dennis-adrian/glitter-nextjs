"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ProfileType } from "@/app/api/users/definitions";

import { Input } from "@/app/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { userCategoryEnum } from "@/db/schema";
import { findUserSocial } from "./utils";
import SubmitButton from "@/app/components/simple-submit-button";
import { updateProfile } from "@/app/lib/users/actions";
import { toast } from "sonner";

const usernameRegex = new RegExp(/^[a-zA-Z0-9_.-]+$/);
const FormSchema = z.object({
  bio: z.string().min(10, { message: "Escribe una bio un poco más larga" }),
  category: z.enum(userCategoryEnum.enumValues),
  displayName: z.string().min(2, {
    message: "El nombre de artista tiene que tener al menos dos letras",
  }),
});

export default function PublicProfileForm({
  profile,
  onSuccess,
}: {
  profile: ProfileType;
  onSuccess: () => void;
}) {
  const instagram = findUserSocial(profile, "instagram");
  const facebook = findUserSocial(profile, "facebook");
  const tiktok = findUserSocial(profile, "tiktok");

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      bio: profile.bio || "",
      displayName: profile.displayName || "",
      category: profile.category,
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const result = await updateProfile(profile.id, {
      ...data,
    });

    if (result.success) {
      toast.success(result.message);
      onSuccess();
    } else {
      toast.error(result.message);
    }
  });

  return (
    <>
      <Form {...form}>
        <form onSubmit={action} className="grid items-start gap-4">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem className="grid gap-2">
                <FormLabel>Nombre Público</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="Ingresa tu nombre"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem className="grid gap-2">
                <FormLabel>Bio</FormLabel>
                <FormControl>
                  <Textarea
                    className="resize-none"
                    maxLength={80}
                    placeholder="Escribe un poco sobre ti"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            Guardar cambios
          </SubmitButton>
        </form>
      </Form>
    </>
  );
}
