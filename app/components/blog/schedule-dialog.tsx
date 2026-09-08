"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
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
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { schedulePost } from "@/app/lib/posts/actions";

const ZONE = "America/La_Paz";

type Props = {
  postId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefills the picker when a schedule is being moved rather than set. */
  currentScheduledAt?: Date | null;
};

/**
 * Picks a publication time.
 *
 * The input is a plain `datetime-local`, which has no timezone of its own — it
 * is whatever the person typing believes. Luxon reads it *as* La Paz time
 * rather than as the browser's zone, so an admin travelling, or a laptop left
 * on the wrong timezone, still schedules the hour they wrote.
 */
export default function ScheduleDialog({
  postId,
  open,
  onOpenChange,
  currentScheduledAt,
}: Props) {
  const [value, setValue] = useState(() =>
    currentScheduledAt
      ? DateTime.fromJSDate(currentScheduledAt)
          .setZone(ZONE)
          .toFormat("yyyy-MM-dd'T'HH:mm")
      : DateTime.now()
          .setZone(ZONE)
          .plus({ hours: 1 })
          .toFormat("yyyy-MM-dd'T'HH:mm"),
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const parsed = DateTime.fromFormat(value, "yyyy-MM-dd'T'HH:mm", {
      zone: ZONE,
    });
    if (!parsed.isValid) {
      toast.error("Elegí una fecha y hora válidas");
      return;
    }

    startTransition(async () => {
      const result = await schedulePost(postId, parsed.toJSDate());
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(
        `Se publicará el ${parsed.setLocale("es").toFormat("d 'de' LLLL 'a las' HH:mm")}`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Programar publicación</DialogTitle>
          <DialogDescription>
            El artículo se publicará solo en la fecha y hora que elijas. Horario
            de Bolivia (La Paz).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="scheduled-at">Fecha y hora</Label>
          <Input
            id="scheduled-at"
            type="datetime-local"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            La revisión del cron corre cada 15 minutos, así que puede publicarse
            hasta 15 minutos después de la hora elegida.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Programando…" : "Programar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
