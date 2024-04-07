"use client";

import { updateProfileWithValidatedData } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";
import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
import SocialMediaInput from "@/app/components/form/fields/social-media";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Form } from "@/app/components/ui/form";
import AutomaticProfilePicUploadForm from "@/app/components/user_profile/profile_pic/automatic_upload_form";
import {
  findUserSocial,
  formatUserSocialsForInsertion,
} from "@/app/components/user_profile/public_profile/utils";
import {
  formatDateOnlyToISO,
  isProfileComplete,
  userCategoryOptions,
} from "@/app/lib/utils";
import { userCategoryEnum } from "@/db/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const usernameRegex = new RegExp(/^[a-zA-Z0-9_.-]+$/);
const phoneRegex = new RegExp(/^\d{8}$/);
const FormSchema = z.object({
  bio: z.string().min(10, { message: "Escribe una bio un poco más larga" }),
  birthdate: z.string().min(1, {
    message: "La fecha de nacimiento es requerida",
  }),
  category: z.enum(userCategoryEnum.enumValues).exclude(["none"]),
  displayName: z.string().min(2, {
    message: "El nombre de artista tiene que tener al menos dos letras",
  }),
  firstName: z
    .string()
    .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
  lastName: z
    .string()
    .min(2, { message: "El apellido tiene que tener al menos dos letras" }),
  phoneNumber: z
    .string()
    .regex(phoneRegex, "Número de teléfono inválido. Necesita tener 8 dígitos"),
  facebookProfile: z
    .string()
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    }),
  instagramProfile: z
    .string()
    .min(2, { message: "Agrega al menos tu perfil de Instagram" })
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    }),
  tiktokProfile: z
    .string()
    .refine((value) => value === "" || usernameRegex.test(value), {
      message: "El nombre de usuario no puede tener caracteres especiales",
    }),
});

export default function ProfileCreationForm({
  profile,
}: {
  profile: ProfileType;
}) {
  const instagramProfile = findUserSocial(profile, "instagram");
  const facebookProfile = findUserSocial(profile, "facebook");
  const tiktokProfile = findUserSocial(profile, "tiktok");

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      bio: profile.bio || "",
      birthdate: formatDateOnlyToISO(profile?.birthdate) || "",
      displayName: profile.displayName || "",
      category: profile.category === "none" ? undefined : profile.category,
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      phoneNumber: profile.phoneNumber || "",
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
      birthdate: new Date(data.birthdate),
      socials: socials.filter(Boolean) as ProfileType["userSocials"],
    });
    if (result.success) {
      redirect("/user_profile");
    } else {
      toast.error(result.message);
    }
  });

  useEffect(() => {
    if (isProfileComplete(profile)) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload, {
      capture: true,
    });
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload, {
        capture: true,
      });
    };
  }, [profile]);

  return (
    <div className="max-w-screen-md mx-auto">
      <Form {...form}>
        <form action={action} className="grid gap-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Completa tu Perfil</h1>
            <Button
              disabled={form.formState.isLoading}
              className="w-full md:max-w-40"
              type="submit"
            >
              Guardar cambios
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Información pública</CardTitle>
              <CardDescription>
                Esta información será visible para todos
              </CardDescription>
            </CardHeader>
            <CardContent className="grid items-start gap-4">
              <AutomaticProfilePicUploadForm profile={profile} />
              <div className="grid items-start md:grid-cols-2 gap-4">
                <TextInput
                  formControl={form.control}
                  label="Nombre público"
                  name="displayName"
                  placeholder="El nombre que verán los demás"
                />
                <SelectInput
                  formControl={form.control}
                  label="Categoría"
                  name="category"
                  options={userCategoryOptions}
                  placeholder="Selecciona una categoría"
                />
                <div className="md:col-span-2">
                  <TextareaInput
                    formControl={form.control}
                    label="Bio"
                    name="bio"
                    placeholder="Cuéntanos un poco sobre ti"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold">Redes sociales</h2>
                    <p className="text-sm text-muted-foreground">
                      Agrega al menos tu perfil de Instagram para ver tu trabajo
                      y analizar tu perfil
                    </p>
                  </div>
                  <div className="grid md:grid-cols-3 gap-2">
                    <SocialMediaInput
                      formControl={form.control}
                      label="Perfil de Instagram"
                      name="instagramProfile"
                      placeholder="usuario"
                    />
                    <SocialMediaInput
                      formControl={form.control}
                      label="Perfil de Facebook"
                      name="facebookProfile"
                      placeholder="usuario"
                    />
                    <SocialMediaInput
                      formControl={form.control}
                      label="Perfil de TikTok"
                      name="tiktokProfile"
                      placeholder="usuario"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Información personal</CardTitle>
              <CardDescription>
                Esta información será visible solamente para el equipo de
                Glitter
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 items-start gap-4">
              <TextInput
                formControl={form.control}
                label="Nombre"
                name="firstName"
                placeholder="Ingresa tu nombre"
              />
              <TextInput
                formControl={form.control}
                label="Apellido"
                name="lastName"
                placeholder="Ingresa tu apellido"
              />
              <TextInput
                formControl={form.control}
                label="Fecha de nacimiento"
                type="date"
                name="birthdate"
                max={formatDateOnlyToISO(new Date())}
              />
              <PhoneInput
                formControl={form.control}
                label="Número de teléfono"
                name="phoneNumber"
              />
            </CardContent>
          </Card>
          <div className="flex justify-end w-full">
            <Button
              disabled={form.formState.isLoading}
              className="w-full md:max-w-40"
              type="submit"
            >
              Guardar cambios
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
