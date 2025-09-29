"use client";

import { Button } from "@/app/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import {
	ArchiveIcon,
	BookMarkedIcon,
	BookUserIcon,
	CreditCardIcon,
	HandshakeIcon,
	MoreHorizontalIcon,
	PencilIcon,
	TrashIcon,
	StickerIcon,
	UserCheckIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ArchiveFestivalModal from "../../festivals/modals/archive-festival";
import DeleteFestival from "../../festivals/delete-festival";

type TableActionsProps = {
	festival: FestivalWithDates;
};

export default function TableActions({ festival }: TableActionsProps) {
	const [openArchiveModal, setOpenArchiveModal] = useState(false);

	return (
		<div className="inline-flex rounded-md overflow-hidden">
			<Link href={`/dashboard/festivals/${festival.id}/edit`}>
				<Button
					variant="ghost"
					size="icon"
				>
					<PencilIcon className="h-4 w-4" />
					<span className="sr-only">Editar festival</span>
				</Button>
			</Link>

			<DeleteFestival festivalId={festival.id}>
				<Button
					variant="ghost"
					size="icon"
				>
					<TrashIcon className="h-4 w-4" />
					<span className="sr-only">Eliminar festival</span>
				</Button>
			</DeleteFestival>

			<DropdownMenu modal={false}>

				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="p-1 rounded-none last:rounded-r-md"
					>
						<MoreHorizontalIcon className="h-4 w-4" />
						<span className="sr-only">Más acciones</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-max">
					<DropdownMenuLabel>Acciones</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<Link href={`/dashboard/festivals/${festival.id}/reservations`}>
							<BookMarkedIcon className="h-4 w-4 mr-2" />
							Reservas
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link href={`/dashboard/festivals/${festival.id}/payments`}>
							<CreditCardIcon className="h-4 w-4 mr-2" />
							Pagos
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link href={`/dashboard/festivals/${festival.id}/festival_activities`}>
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
					<DropdownMenuItem asChild>
						<Link href={`/dashboard/festivals/${festival.id}/collaborators`}>
							<HandshakeIcon className="h-4 w-4 mr-2" />
							Equipo (participantes)
						</Link>
					</DropdownMenuItem>
					{festival.status === "active" && (
						<DropdownMenuItem asChild>
							<Link
								href={`/dashboard/festivals/${festival.id}/tickets/verification`}
							>
								<UserCheckIcon className="h-4 w-4 mr-2" />
								Registro de visitantes
							</Link>
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={() => setOpenArchiveModal(true)}>
						<ArchiveIcon className="h-4 w-4 mr-2" />
						Archivar
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ArchiveFestivalModal
				open={openArchiveModal}
				setOpen={setOpenArchiveModal}
				festival={festival}
			/>
		</div>
	);
}
