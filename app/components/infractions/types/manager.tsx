"use client";

import {
  ArchiveIcon,
  CheckCircle2Icon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import { InfractionSeverityBadge } from "@/app/components/atoms/infraction-severity-badge";
import InfractionTypeActivityAction from "@/app/components/infractions/types/type-activity-action";
import InfractionTypeForm from "@/app/components/infractions/types/type-form";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import type { InfractionType } from "@/app/lib/infractions/definitions";

export default function InfractionTypesManager({
  types,
}: {
  types: InfractionType[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<InfractionType | null>(null);
  const activeCount = types.filter((type) => type.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {activeCount} activos · {types.length - activeCount} archivados
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="mr-2 size-4" />
          Agregar tipo
        </Button>
      </div>

      {types.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No hay tipos de infracción</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Creá el primer tipo para habilitar el registro de infracciones.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {types.map((type) => (
            <article
              key={type.id}
              className="flex flex-col gap-3 rounded-md border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="font-semibold">{type.label}</h2>
                  <p className="font-mono text-xs text-muted-foreground">
                    {type.code}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <InfractionSeverityBadge severity={type.severity} />
                  <Badge variant={type.active ? "green" : "amber"}>
                    {type.active ? (
                      <CheckCircle2Icon className="mr-1 size-3" />
                    ) : (
                      <ArchiveIcon className="mr-1 size-3" />
                    )}
                    {type.active ? "Activo" : "Archivado"}
                  </Badge>
                </div>
              </div>

              <p className="flex-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {type.description || "Sin descripción"}
              </p>

              <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(type)}
                >
                  <PencilIcon className="mr-2 size-4" />
                  Editar
                </Button>
                <InfractionTypeActivityAction type={type} />
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar tipo de infracción</DialogTitle>
            <DialogDescription>
              Definí una categoría reutilizable y explicá qué situaciones
              incluye.
            </DialogDescription>
          </DialogHeader>
          <InfractionTypeForm onSuccess={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar tipo de infracción</DialogTitle>
            <DialogDescription>
              Los cambios de nombre, descripción y severidad también se verán en
              las infracciones históricas asociadas.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <InfractionTypeForm
              key={editing.id}
              type={editing}
              onSuccess={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
