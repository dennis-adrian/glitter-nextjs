"use client";

import { EllipsisIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

/**
 * Phones: "Roles, turnos y fechas", "Exportar CSV" and "Todas las
 * postulaciones" behind the header's "…". Desktop shows them as buttons.
 */
export default function VolunteerMoreOptionsMenu({
  setupHref,
  exportHref,
  allHref,
  className,
}: {
  setupHref: string;
  /** Null until the call is configured. */
  exportHref: string | null;
  allHref: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Más opciones: roles, turnos y fechas, exportar CSV, todas las postulaciones"
          className={className}
        >
          <EllipsisIcon aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
        <DropdownMenuItem asChild className="min-h-11">
          <Link href={setupHref}>Roles, turnos y fechas</Link>
        </DropdownMenuItem>
        {exportHref && (
          <DropdownMenuItem asChild className="min-h-11">
            <a href={exportHref} download>
              Exportar CSV
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className="min-h-11">
          <Link href={allHref}>Todas las postulaciones</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
