"use client";

import { Button } from "@/app/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { updateFestival } from "@/app/lib/festivals/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { FestivalWithDates } from "@/app/data/festivals/definitions";

const formSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  address: z.string().optional(),
  locationLabel: z.string().optional(),
  locationUrl: z.string().url("Debe ser una URL válida").or(z.literal("")),
  startDate: z.string().min(1, "La fecha de inicio es requerida"),
  endDate: z.string().min(1, "La fecha de fin es requerida"),
});

export default function UpdateFestivalForm({ festival }: { festival: FestivalWithDates }) {
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: festival.name,
      description: festival.description || "",
      address: festival.address || "",
      locationLabel: festival.locationLabel || "",
      locationUrl: festival.locationUrl || "",
      startDate: festival.festivalDates[0]?.startDate.toISOString().split('T')[0] || "",
      endDate: festival.festivalDates[0]?.endDate.toISOString().split('T')[0] || "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const result = await updateFestival({
      festival: {
        ...festival,
        name: values.name,
        description: values.description || null,
        address: values.address || null,
        locationLabel: values.locationLabel || null,
        locationUrl: values.locationUrl || null,
      },
      dates: {
        ...festival.festivalDates[0],
        startDate: new Date(values.startDate),
        endDate: new Date(values.endDate),
      },
    });

    if (result.success) {
      toast.success("Festival actualizado correctamente");
      router.refresh();
    } else {
      toast.error(result.message || "Error al actualizar el festival");
    }
  }
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input placeholder="Nombre del festival" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción</FormLabel>
              <FormControl>
                <Textarea placeholder="Descripción del festival" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dirección</FormLabel>
              <FormControl>
                <Input placeholder="Dirección del festival" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="locationLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Etiqueta de ubicación</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Parque de los Niños" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="locationUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL de ubicación</FormLabel>
              <FormControl>
                <Input placeholder="https://maps.google.com/..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de inicio</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de fin</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit">Actualizar festival</Button>
      </form>
    </Form>
  );
}