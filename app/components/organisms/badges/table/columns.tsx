"use client";

import { ColumnDef } from "@tanstack/react-table";
import { BadgeWithFestival } from "@/app/lib/badges/definitions";
import Image from "next/image";

export const columnTitles = {
	badge: "Medalla",
	name: "Nombre",
	description: "Descripción",
	festival: "Festival",
};

export const columns: ColumnDef<BadgeWithFestival>[] = [
	{
		id: "badge",
		header: columnTitles.badge,
		cell: ({ row }) => {
			const imageUrl = row.original.imageUrl;
			if (!imageUrl) return null;

			return (
				<Image src={imageUrl} alt={row.original.name} width={32} height={32} />
			);
		},
	},
	{
		id: "name",
		header: columnTitles.name,
		cell: ({ row }) => row.original.name,
	},
	{
		id: "description",
		header: columnTitles.description,
		cell: ({ row }) => row.original.description,
	},
	{
		id: "festival",
		header: columnTitles.festival,
		cell: ({ row }) => row.original.festival?.name || "--",
	},
];
