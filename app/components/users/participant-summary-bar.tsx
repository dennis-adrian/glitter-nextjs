"use client";

import { Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ParticipantAggregates } from "@/app/lib/participants/definitions";
import { cn } from "@/lib/utils";

type Props = {
  aggregates: ParticipantAggregates;
};

const statusStats = [
  {
    key: "active",
    label: "Activos",
    aggregateKey: "active",
    status: "verified",
  },
  {
    key: "paused",
    label: "Pausados",
    aggregateKey: "paused",
    status: "paused",
  },
  { key: "banned", label: "Vetados", aggregateKey: "banned", status: "banned" },
] as const;

export default function ParticipantSummaryBar({ aggregates }: Props) {
  const searchParams = useSearchParams();
  const { push } = useRouter();

  const activeStatuses = searchParams.getAll("status");
  const pauseEligibleFilter = searchParams.get("pauseEligible") === "true";

  const applySearchParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.set("offset", "0");
    push(`?${params.toString()}`, { scroll: false });
  };

  const applyStatusFilter = (status: string) => {
    applySearchParams((params) => {
      params.delete("status");
      params.delete("pauseEligible");
      params.append("status", status);
    });
  };

  const applyPauseEligibleFilter = () => {
    applySearchParams((params) => {
      params.set("pauseEligible", "true");
      params.delete("status");
      params.append("status", "verified");
    });
  };

  const isStatusActive = (status: string) =>
    !pauseEligibleFilter &&
    activeStatuses.length === 1 &&
    activeStatuses[0] === status;

  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm">
        {statusStats.map((stat, index) => (
          <Fragment key={stat.key}>
            {index > 0 ? (
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => applyStatusFilter(stat.status)}
              className={cn(
                "rounded px-1 -mx-1 transition-colors hover:bg-muted",
                isStatusActive(stat.status) && "bg-muted font-medium",
              )}
              title={`Filtrar por ${stat.label.toLowerCase()}`}
            >
              <span className="text-muted-foreground">{stat.label}</span>{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {aggregates[stat.aggregateKey]}
              </span>
            </button>
          </Fragment>
        ))}
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <span
          className="px-1"
          title="Suma de activos, pausados y vetados (sin solicitudes de perfil)"
        >
          <span className="text-muted-foreground">Total</span>{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {aggregates.totalParticipants}
          </span>
        </span>
      </div>

      {aggregates.pauseEligible > 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={applyPauseEligibleFilter}
            className={cn(
              "rounded underline-offset-2 hover:underline",
              pauseEligibleFilter && "font-medium text-foreground",
            )}
          >
            {aggregates.pauseEligible} elegibles para pausa
          </button>
        </p>
      ) : null}
    </div>
  );
}
