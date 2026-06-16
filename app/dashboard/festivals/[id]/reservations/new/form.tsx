"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2Icon, UserIcon } from "lucide-react";

import { BaseProfile } from "@/app/api/users/definitions";
import ComboboxInput from "@/app/components/form/fields/combobox";
import SelectInput from "@/app/components/form/fields/select";
import { Button } from "@/app/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Textarea } from "@/app/components/ui/textarea";
import {
  ExternalParticipant,
  externalParticipantTypeOptions,
} from "@/app/lib/external_participants/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { createAdminReservation } from "@/app/lib/reservations/admin-actions";
import { createExternalParticipantReservation } from "@/app/lib/external_participants/actions";

const FormSchema = z.object({
  mode: z.enum(["user", "external"]),
  externalMode: z.enum(["existing", "new"]),
  userId: z.string().optional(),
  standId: z.string().min(1, "Seleccioná un espacio"),
  partnerId: z.string().optional(),
  externalParticipantId: z.string().optional(),
  displayName: z.string().optional(),
  type: z.string().optional(),
  customCategoryLabel: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  instagramUrl: z.string().optional(),
  contactEmail: z.string().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

type Props = {
  festivalId: number;
  users: BaseProfile[];
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  externalParticipants: ExternalParticipant[];
};

export default function CreateReservationForm({
  festivalId,
  users,
  sectors,
  externalParticipants,
}: Props) {
  const router = useRouter();

  const userOptions = users.map((u) => ({
    value: String(u.id),
    label: u.displayName ?? u.email ?? String(u.id),
  }));

  const standOptions = sectors.flatMap((sector) =>
    sector.stands.map((stand) => ({
      value: String(stand.id),
      label: `${stand.label ?? ""}${stand.standNumber} — ${sector.name} (${stand.status})`,
    })),
  );

  const externalStandOptions = sectors.flatMap((sector) =>
    sector.stands
      .filter((stand) => stand.status === "available")
      .map((stand) => ({
        value: String(stand.id),
        label: `${stand.label ?? ""}${stand.standNumber} — ${sector.name}`,
      })),
  );

  const externalParticipantOptions = externalParticipants.map(
    (participant) => ({
      value: String(participant.id),
      label: participant.displayName,
    }),
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      mode: "user",
      externalMode: externalParticipantOptions.length > 0 ? "existing" : "new",
      userId: "",
      standId: "",
      partnerId: "",
      externalParticipantId: "",
      displayName: "",
      type: "institution",
      customCategoryLabel: "",
      description: "",
      imageUrl: "",
      websiteUrl: "",
      instagramUrl: "",
      contactEmail: "",
    },
  });

  const mode = form.watch("mode");
  const externalMode = form.watch("externalMode");

  async function onSubmit(data: FormValues) {
    if (data.mode === "user") {
      if (!data.userId) {
        form.setError("userId", { message: "Seleccioná un usuario" });
        return;
      }

      const result = await createAdminReservation({
        festivalId,
        userId: Number(data.userId),
        standId: Number(data.standId),
        partnerId: data.partnerId ? Number(data.partnerId) : undefined,
      });

      if (result.success) {
        toast.success(result.message);
        router.push(`/dashboard/festivals/${festivalId}/reservations`);
      } else {
        toast.error(result.message);
      }
      return;
    }

    if (data.externalMode === "existing") {
      if (!data.externalParticipantId) {
        form.setError("externalParticipantId", {
          message: "Seleccioná un participante externo",
        });
        return;
      }

      const result = await createExternalParticipantReservation({
        festivalId,
        standId: Number(data.standId),
        externalParticipantId: Number(data.externalParticipantId),
      });

      if (result.success) {
        toast.success(result.message);
        router.push(`/dashboard/festivals/${festivalId}/reservations`);
      } else {
        toast.error(result.message);
      }
      return;
    }

    if (!data.displayName?.trim()) {
      form.setError("displayName", { message: "El nombre es requerido" });
      return;
    }
    if (!data.type) {
      form.setError("type", { message: "Seleccioná un tipo" });
      return;
    }

    const result = await createExternalParticipantReservation({
      festivalId,
      standId: Number(data.standId),
      externalParticipant: {
        displayName: data.displayName,
        type: data.type as ExternalParticipant["type"],
        customCategoryLabel: data.customCategoryLabel,
        description: data.description,
        imageUrl: data.imageUrl,
        websiteUrl: data.websiteUrl,
        instagramUrl: data.instagramUrl,
        contactEmail: data.contactEmail,
      },
    });

    if (result.success) {
      toast.success(result.message);
      router.push(`/dashboard/festivals/${festivalId}/reservations`);
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <FormField
          control={form.control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Tabs value={field.value} onValueChange={field.onChange}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="user" className="gap-2">
                      <UserIcon className="size-4" />
                      Usuario
                    </TabsTrigger>
                    <TabsTrigger value="external" className="gap-2">
                      <Building2Icon className="size-4" />
                      Participante externo
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {mode === "user" ? (
          <>
            <ComboboxInput
              form={form}
              name="userId"
              label="Usuario"
              placeholder="Seleccionar usuario"
              options={userOptions}
            />
            <ComboboxInput
              form={form}
              name="standId"
              label="Espacio"
              placeholder="Seleccionar espacio"
              options={standOptions}
            />
            <ComboboxInput
              form={form}
              name="partnerId"
              label="Acompañante (opcional)"
              placeholder="Seleccionar acompañante"
              options={userOptions}
            />
          </>
        ) : (
          <>
            <FormField
              control={form.control}
              name="externalMode"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Tabs value={field.value} onValueChange={field.onChange}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="existing">Existente</TabsTrigger>
                        <TabsTrigger value="new">Nuevo</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {externalMode === "existing" ? (
              <ComboboxInput
                form={form}
                name="externalParticipantId"
                label="Participante externo"
                placeholder="Seleccionar participante"
                options={externalParticipantOptions}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextField
                  name="displayName"
                  label="Nombre"
                  placeholder="Nombre de la institución"
                />
                <SelectInput
                  formControl={form.control}
                  name="type"
                  label="Tipo"
                  placeholder="Seleccionar tipo"
                  options={externalParticipantTypeOptions}
                />
                <TextField
                  name="customCategoryLabel"
                  label="Etiqueta de categoría"
                  placeholder="Ej. Refugio animal"
                />
                <TextField
                  name="imageUrl"
                  label="Imagen o logo"
                  placeholder="https://..."
                />
                <TextField
                  name="websiteUrl"
                  label="Sitio web"
                  placeholder="https://..."
                />
                <TextField
                  name="instagramUrl"
                  label="Instagram"
                  placeholder="https://instagram.com/..."
                />
                <TextField
                  name="contactEmail"
                  label="Correo de contacto"
                  placeholder="contacto@..."
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Breve descripción para referencia interna o pública"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <ComboboxInput
              form={form}
              name="standId"
              label="Espacio disponible"
              placeholder="Seleccionar espacio"
              options={externalStandOptions}
            />
          </>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(`/dashboard/festivals/${festivalId}/reservations`)
            }
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creando..." : "Crear reserva"}
          </Button>
        </div>
      </form>
    </Form>
  );

  function TextField({
    name,
    label,
    placeholder,
  }: {
    name: keyof FormValues;
    label: string;
    placeholder?: string;
  }) {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input placeholder={placeholder} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
}
