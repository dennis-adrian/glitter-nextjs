"use client";

import { ProfileType } from "@/app/api/users/definitions";
import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
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
import { formatDateOnlyToISO, userCategoryOptions } from "@/app/lib/utils";
import { useForm } from "react-hook-form";

export default function ProfileCreationForm({
  profile,
}: {
  profile: ProfileType;
}) {
  const form = useForm();

  return (
    <div className="max-w-screen-md mx-auto">
      <h1 className="text-2xl font-bold my-4">Perfil</h1>
      <Form {...form}>
        <form action="" className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Información pública</CardTitle>
              <CardDescription>
                Esta información será visible para todos
              </CardDescription>
            </CardHeader>
            <CardContent className="grid items-start gap-4">
              <AutomaticProfilePicUploadForm profile={profile} />
              <div className="grid md:grid-cols-2 gap-4">
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
              </div>
              <TextareaInput
                form={form}
                label="Bio"
                name="bio"
                placeholder="Cuéntanos un poco sobre ti"
              />
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
          <div className="grid gap-2 grid-cols-1 md:grid-cols-2 justify-end">
            <Button className="md:order-2" type="submit">
              Guardar cambios
            </Button>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
