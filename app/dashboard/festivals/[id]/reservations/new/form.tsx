"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BaseProfile } from "@/app/api/users/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { createAdminReservation } from "@/app/lib/reservations/admin-actions";
import ComboboxInput from "@/app/components/form/fields/combobox";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";

const FormSchema = z.object({
  userId: z.string().min(1, "Seleccioná un usuario"),
  standId: z.string().min(1, "Seleccioná un espacio"),
  partnerId: z.string().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

type Props = {
  festivalId: number;
  users: BaseProfile[];
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
};

export default function CreateReservationForm({ festivalId, users, sectors }: Props) {
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

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { userId: "", standId: "", partnerId: "" },
  });

  async function onSubmit(data: FormValues) {
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
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
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
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/festivals/${festivalId}/reservations`)}
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
}
