"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { updateProfileWithValidatedData } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";

import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import AutomaticProfilePicUploadForm from "@/app/components/user_profile/profile_pic/automatic_upload_form";
import { userCategoryOptions } from "@/app/lib/utils";
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
import { userCategoryEnum } from "@/db/schema";
import { findUserSocial, formatUserSocialsForInsertion } from "./utils";

const usernameRegex = new RegExp(/^[a-zA-Z0-9_.-]+$/);
const FormSchema = z.object({
  bio: z.string().min(10, { message: "Escribe una bio un poco más larga" }),
  category: z.enum(userCategoryEnum.enumValues),
  displayName: z.string().min(2, {
    message: "El nombre de artista tiene que tener al menos dos letras",
  }),
  facebookProfile: z
    .string()
    .transform((v) => v.trim())
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    }),
  instagramProfile: z
    .string()
    .min(2, { message: "Agrega al menos tu perfil de Instagram" })
    .transform((v) => v.trim())
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    }),
  tiktokProfile: z
    .string()
    .transform((v) => v.trim())
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    }),
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
      bio: profile.bio || "",
      displayName: profile.displayName || "",
      category: profile.category,
      instagramProfile: instagramProfile?.username || "",
      facebookProfile: facebookProfile?.username || "",
      tiktokProfile: tiktokProfile?.username || "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const socials = formatUserSocialsForInsertion(data, profile);
    const result = await updateProfileWithValidatedData(profile.id, {
      ...profile,
      ...data,
      socials: socials.filter(Boolean) as ProfileType["userSocials"],
    });
    if (result.success) onSuccess();
  });

  return (
    <>
      <AutomaticProfilePicUploadForm profile={profile} />
      <Form {...form}>
        <form action={action} className="grid items-start gap-4">
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
          {profile.status !== "verified" ||
            (profile.role !== "admin" && (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      ¿En cuál categoría te gustaría participar?
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elige una opción" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {userCategoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            ))}
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
                      placeholder="Tu usuario de TikTok"
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
    </>
  );
}
