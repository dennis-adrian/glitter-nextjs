"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { createVenue } from "@/app/lib/programs/catalog-actions";
import type { Venue } from "@/app/lib/programs/definitions";

type Props = {
  /** Receives the created venue so the caller can select it immediately. */
  onCreated: (venue: Pick<Venue, "id" | "name">) => void;
};

const EMPTY = { name: "", address: "", locationLabel: "", locationUrl: "" };

/**
 * Creates a venue without leaving the form that needs it. The alternative —
 * navigating to the venues page and back — loses everything typed so far.
 */
export default function VenueQuickCreateDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();

  function set(field: keyof typeof EMPTY, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleCreate() {
    startTransition(async () => {
      try {
        const name = values.name.trim();
        const result = await createVenue({
          name,
          address: values.address || null,
          locationLabel: values.locationLabel || null,
          locationUrl: values.locationUrl || null,
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        onCreated({ id: result.venueId, name });
        setValues(EMPTY);
        setOpen(false);
      } catch (error) {
        console.error(error);
        toast.error("No se pudo crear el lugar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Nuevo lugar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo lugar</DialogTitle>
          <DialogDescription>
            Se crea al instante y queda seleccionado en el formulario.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="quick-venue-name">Nombre</Label>
            <Input
              id="quick-venue-name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Casa Glitter"
              disabled={isPending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quick-venue-address">Dirección</Label>
            <Input
              id="quick-venue-address"
              value={values.address}
              onChange={(event) => set("address", event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quick-venue-label">Referencia</Label>
            <Input
              id="quick-venue-label"
              value={values.locationLabel}
              onChange={(event) => set("locationLabel", event.target.value)}
              placeholder="Zona Sur, entre calles…"
              disabled={isPending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quick-venue-url">Enlace de mapa</Label>
            <Input
              id="quick-venue-url"
              value={values.locationUrl}
              onChange={(event) => set("locationUrl", event.target.value)}
              placeholder="https://maps.app.goo.gl/…"
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={isPending || !values.name.trim()}
            onClick={handleCreate}
          >
            {isPending ? "Creando..." : "Crear lugar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
