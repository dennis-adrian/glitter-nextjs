"use client";

import Link from "next/link";
import { useState } from "react";

import FestivalStatusBadge from "@/app/components/atoms/festival-status-badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  audienceCountLine,
  confirmadosListName,
  type FestivalListSummary,
} from "@/app/lib/distribution_lists/definitions";
import type { FestivalBase } from "@/app/lib/festivals/definitions";

/** One computed list per festival, newest first, with a search by name. */
export default function FestivalListsTable({
  festivals,
}: {
  festivals: FestivalListSummary[];
}) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("es");
  const shown = term
    ? festivals.filter((festival) =>
        festival.festivalName.toLocaleLowerCase("es").includes(term),
      )
    : festivals;

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscá un festival…"
        aria-label="Buscar festival"
        className="max-w-sm"
      />
      {festivals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay festivales.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ningún festival coincide con «{search.trim()}».
        </p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lista</TableHead>
                <TableHead>Pueden recibirlo hoy</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((festival) => (
                <TableRow key={festival.festivalId}>
                  <TableCell className="min-w-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {confirmadosListName(festival.festivalName)}
                      </span>
                      <FestivalStatusBadge
                        status={
                          festival.festivalStatus as FestivalBase["status"]
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {audienceCountLine(festival.count)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/dashboard/communications/lists/festival/${festival.festivalId}`}
                      >
                        Ver
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
