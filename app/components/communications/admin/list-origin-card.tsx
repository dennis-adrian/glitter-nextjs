"use client";

import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import PullNewMembersDialog from "@/app/components/communications/admin/pull-new-members-dialog";
import { Button } from "@/app/components/ui/button";
import {
  type DistributionListOrigin,
  pullButtonLabel,
} from "@/app/lib/distribution_lists/definitions";
import { formatDateWithTime } from "@/app/lib/formatters";

function originHref(origin: DistributionListOrigin) {
  if (!origin.source) return null;
  return origin.source.kind === "festival"
    ? `/dashboard/communications/lists/festival/${origin.source.festivalId}`
    : `/dashboard/communications/lists/${origin.source.listId}`;
}

/** On a copy (B10): where it came from, when, and "Traer nuevos". */
export default function ListOriginCard({
  listId,
  origin,
  readOnly = false,
}: {
  listId: number;
  origin: DistributionListOrigin;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const href = originHref(origin);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="min-w-0 space-y-0.5 text-sm">
        <p>
          Copia de{" "}
          {href ? (
            <Link href={href} className="font-medium hover:underline">
              «{origin.name}»
            </Link>
          ) : (
            <span className="font-medium">«{origin.name}»</span>
          )}
          {`, del ${formatDateWithTime(origin.copiedAt)}.`}
        </p>
        <p className="text-muted-foreground">
          {origin.lastPulledAt
            ? `Trajiste nuevos por última vez el ${formatDateWithTime(origin.lastPulledAt)}.`
            : "Todavía no trajiste nuevos."}{" "}
          {origin.source
            ? "Quienes entran al original no se suman solos."
            : "El original ya no existe: no hay de dónde traer nuevos."}
        </p>
      </div>
      {origin.source && !readOnly && (
        <>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <DownloadIcon className="mr-2 h-4 w-4" aria-hidden />
            {pullButtonLabel(origin.name)}
          </Button>
          <PullNewMembersDialog
            listId={listId}
            originName={origin.name}
            open={open}
            onOpenChange={setOpen}
          />
        </>
      )}
    </div>
  );
}
