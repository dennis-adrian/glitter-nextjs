"use client";

import { MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import ArchiveListDialog from "@/app/components/communications/admin/archive-list-dialog";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
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
  DISTRIBUTION_LIST_KIND_LABELS,
  type DistributionListSummary,
} from "@/app/lib/distribution_lists/definitions";

export default function SavedListsTable({
  lists,
}: {
  lists: DistributionListSummary[];
}) {
  const [archiving, setArchiving] = useState<DistributionListSummary | null>(
    null,
  );

  if (lists.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Todavía no guardaste listas. Las de cada festival ya están arriba.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Pueden recibirlo hoy</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lists.map((list) => (
              <TableRow key={list.id}>
                <TableCell className="min-w-48">
                  <Link
                    href={`/dashboard/communications/lists/${list.id}`}
                    className="font-medium hover:underline"
                  >
                    {list.name}
                  </Link>
                  {list.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {list.description}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={list.kind === "filter" ? "secondary" : "outline"}
                  >
                    {DISTRIBUTION_LIST_KIND_LABELS[list.kind]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {list.count ? (
                    audienceCountLine(list.count)
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">
                      El filtro ya no se puede leer: editala.
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {/* Not modal: the menu opens a dialog, and a modal menu
                      would leave the page inert behind it. */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Acciones de ${list.name}`}
                      >
                        <MoreHorizontalIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/dashboard/communications/lists/${list.id}`}
                        >
                          Editar
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setArchiving(list)}>
                        Archivar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ArchiveListDialog
        list={archiving}
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
      />
    </>
  );
}
