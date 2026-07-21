"use client";

import { useRouter } from "next/navigation";
import { useForm, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2Icon, Loader2Icon, UserIcon } from "lucide-react";
import { DateTime } from "luxon";
import { twMerge } from "tailwind-merge";

import { formatStandLabel } from "@/app/lib/stands/helpers";

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
import { UploadButton } from "@/app/vendors/uploadthing";
import {
  ExternalParticipant,
  externalParticipantTypeOptions,
} from "@/app/lib/external_participants/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { createAdminReservation } from "@/app/lib/reservations/admin-actions";
import { createExternalParticipantReservation } from "@/app/lib/external_participants/actions";
import { deleteFile } from "@/app/lib/uploadthing/actions";

const FormSchema = z.object({
  mode: z.enum(["user", "external"]),
  externalMode: z.enum(["existing", "new"]),
  userId: z.string().optional(),
  standId: z.string().min(1, "Seleccioná un espacio"),
  revealAt: z.string().optional(),
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
  contactPhone: z.string().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

type Props = {
  festivalId: number;
  users: BaseProfile[];
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  externalParticipants: ExternalParticipant[];
  reservationsStartDate: Date;
};

// Format/parse in the store timezone so SSR and client hydration agree
// regardless of the server's or browser's local zone.
function toDateTimeLocal(date: Date): string {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).toFormat(
    "yyyy-MM-dd'T'HH:mm",
  );
}

function fromDateTimeLocal(value: string): Date {
  return DateTime.fromFormat(value, "yyyy-MM-dd'T'HH:mm", {
    zone: STORE_TIMEZONE,
  }).toJSDate();
}

function TextField({
  form,
  name,
  label,
  placeholder,
}: {
  form: UseFormReturn<FormValues>;
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

export default function CreateReservationForm({
  festivalId,
  users,
  sectors,
  externalParticipants,
  reservationsStartDate,
}: Props) {
  const router = useRouter();

  const userOptions = users.map((u) => ({
    value: String(u.id),
    label: u.displayName ?? u.email ?? String(u.id),
  }));

  const standOptions = sectors.flatMap((sector) =>
    sector.stands.map((stand) => ({
      value: String(stand.id),
      label: `${formatStandLabel(stand)} — ${sector.name} (${stand.status})`,
    })),
  );

  const externalStandOptions = sectors.flatMap((sector) =>
    sector.stands
      .filter((stand) => stand.status === "available")
      .map((stand) => ({
        value: String(stand.id),
        label: `${formatStandLabel(stand)} — ${sector.name}`,
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
      revealAt: toDateTimeLocal(reservationsStartDate),
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
      contactPhone: "",
    },
  });

  const mode = form.watch("mode");
  const externalMode = form.watch("externalMode");
  const externalImageUrl = form.watch("imageUrl");

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
        revealAt: data.revealAt ? fromDateTimeLocal(data.revealAt) : null,
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
        revealAt: data.revealAt ? fromDateTimeLocal(data.revealAt) : null,
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
      revealAt: data.revealAt ? fromDateTimeLocal(data.revealAt) : null,
      externalParticipant: {
        displayName: data.displayName,
        type: data.type as ExternalParticipant["type"],
        customCategoryLabel: data.customCategoryLabel,
        description: data.description,
        imageUrl: data.imageUrl,
        websiteUrl: data.websiteUrl,
        instagramUrl: data.instagramUrl,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
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

        <FormField
          control={form.control}
          name="revealAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Revelar en</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <p className="text-muted-foreground text-sm">
                Hasta este momento el espacio se muestra como disponible para
                los participantes y no revela quién lo reservó. El espacio queda
                reservado y no puede ser tomado por nadie. Por defecto, la fecha
                de apertura de reservas.
              </p>
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
                  form={form}
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
                  form={form}
                  name="customCategoryLabel"
                  label="Etiqueta de categoría"
                  placeholder="Ej. Refugio animal"
                />
                <ExternalParticipantImageField imageUrl={externalImageUrl} />
                <TextField
                  form={form}
                  name="websiteUrl"
                  label="Sitio web"
                  placeholder="https://..."
                />
                <TextField
                  form={form}
                  name="instagramUrl"
                  label="Instagram"
                  placeholder="https://instagram.com/..."
                />
                <TextField
                  form={form}
                  name="contactEmail"
                  label="Correo de contacto"
                  placeholder="contacto@..."
                />
                <TextField
                  form={form}
                  name="contactPhone"
                  label="Teléfono de contacto"
                  placeholder="+591 ..."
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

  function ExternalParticipantImageField({ imageUrl }: { imageUrl?: string }) {
    return (
      <FormField
        control={form.control}
        name="imageUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Imagen o logo</FormLabel>
            <FormControl>
              <div className="grid gap-3">
                <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Vista previa"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2Icon className="size-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <UploadButton
                        config={{ cn: twMerge }}
                        endpoint="externalParticipantImage"
                        content={{
                          button({ ready, isUploading, uploadProgress }) {
                            if (isUploading && uploadProgress === 100) {
                              return (
                                <Loader2Icon className="size-4 animate-spin text-primary-500" />
                              );
                            }
                            if (isUploading)
                              return <span>{uploadProgress}%</span>;
                            if (ready) return <span>Subir imagen</span>;
                            return "Cargando...";
                          },
                          allowedContent({ ready, isUploading }) {
                            if (!ready) return null;
                            if (isUploading) return "Subiendo imagen...";
                            return "Imagen hasta 4MB";
                          },
                        }}
                        appearance={{
                          button: ({ ready, isUploading }) => {
                            if (!ready) {
                              return "bg-transparent text-xs text-muted-foreground border";
                            }
                            if (isUploading) {
                              return "bg-transparent text-xs text-muted-foreground border after:bg-primary-700/60";
                            }
                            return "bg-transparent text-xs text-foreground border hover:text-primary-500 hover:border-primary-500";
                          },
                        }}
                        onClientUploadComplete={(res) => {
                          const uploadedUrl =
                            res?.[0]?.serverData?.imageUrl ?? res?.[0]?.url;
                          if (uploadedUrl && typeof uploadedUrl === "string") {
                            field.onChange(uploadedUrl);
                            toast.success("Imagen subida");
                          } else {
                            toast.error("Respuesta de carga inválida");
                          }
                        }}
                        onUploadError={() => {
                          toast.error("Error al subir la imagen");
                        }}
                      />
                      {imageUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const result = await deleteFile(imageUrl);
                            if (result.success) {
                              field.onChange("");
                              toast.success("Imagen eliminada");
                            } else {
                              toast.error(
                                result.error || "Error al eliminar la imagen",
                              );
                            }
                          }}
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
}
