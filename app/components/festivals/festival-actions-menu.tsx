"use client";

import {
  ArchiveIcon,
  DownloadIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import DeleteFestival from "@/app/components/festivals/delete-festival";
import FestivalExportDialog from "@/app/components/festivals/festival-export-dialog";
import FestivalImportDialog from "@/app/components/festivals/festival-import-dialog";
import {
  FESTIVAL_SECTION_GROUP_LABELS,
  festivalSectionHref,
  visibleFestivalSections,
  type FestivalSectionGroup,
} from "@/app/components/festivals/festival-sections";
import ArchiveFestivalModal from "@/app/components/festivals/modals/archive-festival";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import type { FestivalBase } from "@/app/lib/festivals/definitions";

type FestivalActionsMenuProps = {
  festival: FestivalBase;
  /**
   * The festivals list offers every section of the festival from the row; the
   * festival page already lays them out, so it leaves them out.
   */
  showSections?: boolean;
  triggerVariant?: "ghost" | "outline";
  triggerClassName?: string;
};

const GROUPS: FestivalSectionGroup[] = ["visitors", "participants", "spaces"];

/** Everything an admin can do to one festival, behind one button. */
export default function FestivalActionsMenu({
  festival,
  showSections = false,
  triggerVariant = "ghost",
  triggerClassName,
}: FestivalActionsMenuProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const sections = visibleFestivalSections(festival.status);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={triggerVariant}
            size="icon"
            className={triggerClassName}
            aria-label={`Acciones de ${festival.name}`}
          >
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {showSections ? (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/festivals/${festival.id}`}>
                  <EyeIcon className="mr-2 h-4 w-4" />
                  Ver festival
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/festivals/${festival.id}/edit`}>
                  <PencilIcon className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {GROUPS.map((group) => (
                <DropdownMenuSub key={group}>
                  <DropdownMenuSubTrigger>
                    {FESTIVAL_SECTION_GROUP_LABELS[group]}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-52">
                    {sections
                      .filter((section) => section.group === group)
                      .map((section) => (
                        <DropdownMenuItem key={section.key} asChild>
                          <Link href={festivalSectionHref(festival.id, section)}>
                            <section.icon className="mr-2 h-4 w-4" />
                            {section.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : (
            <DropdownMenuLabel>Datos del festival</DropdownMenuLabel>
          )}
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setExportOpen(true)}>
              <DownloadIcon className="mr-2 h-4 w-4" />
              Exportar datos
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setImportOpen(true)}>
              <UploadIcon className="mr-2 h-4 w-4" />
              Importar datos
            </DropdownMenuItem>
            {festival.status !== "archived" ? (
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                <ArchiveIcon className="mr-2 h-4 w-4" />
                Archivar
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-red-600 focus:text-red-700"
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ArchiveFestivalModal
        open={archiveOpen}
        setOpen={setArchiveOpen}
        festival={festival}
      />
      <FestivalExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        festivalId={festival.id}
      />
      <FestivalImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        mode="existing"
        festivalId={festival.id}
        festivalName={festival.name}
      />
      <DeleteFestival
        festivalId={festival.id}
        festivalName={festival.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
