"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  updateProfileWithValidatedData,
} from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/components/ui/button";

const FormSchema = z.object({
  displayName: z.string().min(2, {
    message: "El nombre de artista tiene que tener al menos dos letras",
  }),
  bio: z
    .string()
    .min(2, { message: "La bio tiene que tener al menos dos letras" }),
  instagramProfile: z.string(),
  facebookProfile: z.string(),
  twitterProfile: z.string(),
  tiktokProfile: z.string(),
  youtubeProfile: z.string(),
});

export default function PublicProfileForm({
  profile,
  onSuccess,
}: {
  profile: ProfileType;
  onSuccess: () => void;
}) {
  // const instagramProfile = profile.socials.find(
  //   (userSocial) => userSocial.social.name === "instagram",
  // );

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      displayName: profile.displayName || "",
      bio: profile.bio || "",
      // instagramProfile: instagramProfile?.username || "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const result = await updateProfileWithValidatedData(profile.id, {
      ...profile,
      ...data,
    });
    if (result.success) onSuccess();
  });

  return (
    <Form {...form}>
      <form action={action} className="grid items-start gap-4">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Nombre Público</FormLabel>
              <FormControl>
                <Input type="text" placeholder="Ingresa tu nombre" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Apellido</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Ingresa tu apellido"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        /> */}
        <Button type="submit">Guardar cambios</Button>
      </form>
    </Form>
  );
}
