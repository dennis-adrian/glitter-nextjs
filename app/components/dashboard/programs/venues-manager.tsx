"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Form } from "@/app/components/ui/form";
import { createVenue, updateVenue } from "@/app/lib/programs/catalog-actions";
import type { Venue } from "@/app/lib/programs/definitions";
import {
  textOrNull,
  venueFormSchema,
  type VenueFormValues,
} from "@/app/lib/programs/form-schemas";

type Props = {
  venues: Venue[];
};

export default function VenuesManager({ venues }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<Venue | null>(null);

  const form = useForm<VenueFormValues>({
    resolver: zodResolver(venueFormSchema),
    defaultValues: {
      name: "",
      address: "",
      locationLabel: "",
      locationUrl: "",
    },
  });

  function startEditing(venue: Venue) {
    setEditing(venue);
    form.reset({
      name: venue.name,
      address: venue.address ?? "",
      locationLabel: venue.locationLabel ?? "",
      locationUrl: venue.locationUrl ?? "",
    });
  }

  function stopEditing() {
    setEditing(null);
    form.reset({ name: "", address: "", locationLabel: "", locationUrl: "" });
  }

  const action = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      address: textOrNull(values.address),
      locationLabel: textOrNull(values.locationLabel),
      locationUrl: textOrNull(values.locationUrl),
    };

    try {
      const result = editing
        ? await updateVenue(editing.id, payload)
        : await createVenue(payload);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      stopEditing();
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar el lugar");
    }
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Editar lugar" : "Nuevo lugar"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="grid gap-4" onSubmit={action}>
              <TextInput label="Nombre" name="name" required />
              <TextInput label="Dirección" name="address" />
              <TextInput label="Referencia" name="locationLabel" />
              <TextInput label="Enlace de mapa" name="locationUrl" />
              <div className="flex gap-2">
                <SubmitButton
                  disabled={form.formState.isSubmitting}
                  label={editing ? "Guardar" : "Crear lugar"}
                />
                {editing ? (
                  <Button type="button" variant="ghost" onClick={stopEditing}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lugares</CardTitle>
        </CardHeader>
        <CardContent>
          {venues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay lugares.
            </p>
          ) : (
            <ul className="space-y-2">
              {venues.map((venue) => (
                <li
                  key={venue.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{venue.name}</p>
                    {venue.address ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {venue.address}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing(venue)}
                  >
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
