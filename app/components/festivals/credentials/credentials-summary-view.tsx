"use client";

import type { ReactNode } from "react";

import CredentialsBreakdown from "@/app/components/festivals/credentials/credentials-breakdown";
import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import CredentialsSourcesCard from "@/app/components/festivals/credentials/credentials-sources-card";
import type { ToggleableCredentialGroup } from "@/app/lib/credentials/definitions";
import { cn } from "@/app/lib/utils";

/**
 * One figure, label in sentence case: `StatTile` always uppercases its label,
 * which this feature never does.
 */
function Tile({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: number;
  hint: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border px-5 py-4",
        strong
          ? "border-transparent bg-brand-deep text-white"
          : "bg-card shadow-xs",
      )}
    >
      <span className={cn("text-xs font-semibold", !strong && "text-muted-foreground")}>
        {label}
      </span>
      <span className="font-display text-4xl font-bold leading-none tabular-nums">
        {value.toLocaleString("es-BO")}
      </span>
      <span className={cn("break-words text-xs", !strong && "text-muted-foreground")}>
        {hint}
      </span>
    </div>
  );
}

/** Resumen (M1, M6). */
export default function CredentialsSummaryView({
  groups,
  printNotice,
  printCard,
}: {
  groups?: readonly ToggleableCredentialGroup[];
  /** What changed since the last batch, once batches exist. */
  printNotice?: ReactNode;
  /** "Última impresión", once batches exist. */
  printCard?: ReactNode;
}) {
  const { view } = useCredentials();
  const { summary } = view;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_35rem] flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Tile strong label="Total a producir" value={summary.total} hint="credenciales" />
          <Tile
            label="Con nombre"
            value={summary.named}
            hint="Llevan impreso el nombre de la persona o la marca"
          />
          <Tile label="Sin nombre" value={summary.unnamed} hint="Genéricas, para acompañantes" />
        </div>
        {printNotice}
        <CredentialsBreakdown />
      </div>
      <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-6">
        <CredentialsSourcesCard groups={groups} />
        {printCard}
      </div>
    </div>
  );
}
