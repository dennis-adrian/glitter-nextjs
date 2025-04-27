"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVerticalIcon, PencilIcon, TrashIcon } from "lucide-react";
import DeleteFestival from "./delete-festival";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function FestivalCardDropdown({
	festivalId,
}: {
	festivalId: number;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon">
					<MoreVerticalIcon className="h-5 w-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem asChild>
					<Link
						href={`/dashboard/festivals/${festivalId}/edit`}
						className="flex items-center gap-2 w-full"
					>
						<PencilIcon className="w-4 h-4" />
						Editar
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={(e) => e.preventDefault()}>
					<DeleteFestival festivalId={festivalId}>
						<span className="flex items-center gap-2 text-red-600 w-full">
							<TrashIcon className="w-4 h-4" />
							Eliminar
						</span>
					</DeleteFestival>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
