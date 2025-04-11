import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import {
  BookMarkedIcon,
  BookUserIcon,
  MoreHorizontalIcon,
  StickerIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";

type TableActionsProps = {
  festival: FestivalWithDates;
};

export default function TableActions({ festival }: TableActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/festivals/${festival.id}/reservations`}>
            <BookMarkedIcon className="h-4 w-4 mr-2" />
            Reservas
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/dashboard/festivals/${festival.id}/festival_activities`}
          >
            <StickerIcon className="h-4 w-4 mr-2" />
            Actividades
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/festivals/${festival.id}/tickets`}>
            <BookUserIcon className="h-4 w-4 mr-2" />
            Visitantes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/festivals/${festival.id}/participants`}>
            <UsersIcon className="h-4 w-4 mr-2" />
            Participantes
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
