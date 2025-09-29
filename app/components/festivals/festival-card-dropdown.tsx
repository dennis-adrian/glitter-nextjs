"use client";

import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
	ArchiveIcon,
	MoreVerticalIcon,
	PencilIcon,
	TrashIcon,
	UsersIcon,
} from "lucide-react";
import DeleteFestival from "./delete-festival";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import ArchiveFestivalModal from "@/app/components/festivals/modals/archive-festival";
import { FestivalBase } from "@/app/lib/festivals/definitions";

export default function FestivalCardDropdown({
	festival,
}: {
	festival: FestivalBase;
}) {
	const [openArchiveModal, setOpenArchiveModal] = useState(false);

	return (
		<>
			<DropdownMenu modal={false}>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon">
						<MoreVerticalIcon className="h-5 w-5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem asChild>
						<Link
							href={`/dashboard/festivals/${festival.id}/allowed_participants`}
							className="flex items-center gap-2 w-full"
						>
							<UsersIcon className="w-4 h-4" />
							Participantes habilitados
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link
							href={`/dashboard/festivals/${festival.id}/edit`}
							className="flex items-center gap-2 w-full"
						>
							<PencilIcon className="w-4 h-4" />
							Editar
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setOpenArchiveModal(true)}>
						<ArchiveIcon className="w-4 h-4 mr-2" />
						Archivar
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={(e) => e.preventDefault()}>
						<DeleteFestival festivalId={festival.id}>
							<span className="flex items-center gap-2 text-red-600 w-full">
								<TrashIcon className="w-4 h-4" />
								Eliminar
							</span>
						</DeleteFestival>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ArchiveFestivalModal
				open={openArchiveModal}
				setOpen={setOpenArchiveModal}
				festival={festival}
			/>
		</>
	);
}
