"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { updateProfileWithValidatedData } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";

import { Input } from "@/app/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { findUserSocial, formatUserSocialsForInsertion } from "./utils";

const FormSchema = z.object({
  displayName: z.string().min(2, {
    message: "El nombre de artista tiene que tener al menos dos letras",
  }),
  bio: z.string().min(10, { message: "Escribe una bio un poco más larga" }),
  instagramProfile: z.string(),
  facebookProfile: z.string(),
  tiktokProfile: z.string(),
});

export default function PublicProfileForm({
  profile,
  onSuccess,
}: {
  profile: ProfileType;
  onSuccess: () => void;
}) {
  const instagramProfile = findUserSocial(profile, "instagram");
  const facebookProfile = findUserSocial(profile, "facebook");
  const tiktokProfile = findUserSocial(profile, "tiktok");

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      displayName: profile.displayName || "",
      bio: profile.bio || "",
      instagramProfile: instagramProfile?.username || "",
      facebookProfile: facebookProfile?.username || "",
      tiktokProfile: tiktokProfile?.username || "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const socials = formatUserSocialsForInsertion(data, profile);
    console.log(socials);
    const result = await updateProfileWithValidatedData(profile.id, {
      ...profile,
      ...data,
      socials: socials.filter(Boolean) as ProfileType["userSocials"],
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
        <div className="text-muted-foreground mt-3 font-bold">
          Debes agregar al menos una red social
        </div>
        <FormField
          control={form.control}
          name="instagramProfile"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Perfil de Instagram</FormLabel>
              <FormControl>
                <div className="flex items-center">
                  <span className="mx-2">@</span>
                  <Input
                    type="text"
                    placeholder="Tu usuario de Instagram"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tiktokProfile"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Perfil de Tik Tok</FormLabel>
              <FormControl>
                <div className="flex items-center">
                  <span className="mx-2">@</span>
                  <Input
                    type="text"
                    placeholder="Tu usuario de Tik Tok"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="facebookProfile"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Perfil de Facebook</FormLabel>
              <FormControl>
                <div className="flex items-center">
                  <span className="mx-2">@</span>
                  <Input
                    type="text"
                    placeholder="Tu usuario de Facebook"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Guardar cambios</Button>
      </form>
    </Form>
  );
}
