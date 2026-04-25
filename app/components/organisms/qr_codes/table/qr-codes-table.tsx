"use client";

import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import type { QrCodeBase } from "@/app/lib/qr_codes/definitions";
import { type QrCodeStatus, getQrCodeStatus } from "@/app/lib/qr_codes/status";
import { useMemo, useState } from "react";

import { columnTitles, columns } from "./columns";

type FilterValue = "all" | QrCodeStatus;

const filterOptions: { value: FilterValue; label: string }[] = [
	{ value: "all", label: "Todos" },
	{ value: "active", label: "Activos" },
	{ value: "expiring_soon", label: "Por vencer" },
	{ value: "expired", label: "Vencidos" },
];

type Props = {
	qrCodes: QrCodeBase[];
};

export default function QrCodesTable({ qrCodes }: Props) {
	const [filter, setFilter] = useState<FilterValue>("all");

	const counts = useMemo(() => {
		const acc: Record<FilterValue, number> = {
			all: qrCodes.length,
			active: 0,
			expiring_soon: 0,
			expired: 0,
		};
		const now = new Date();
		for (const qr of qrCodes) {
			acc[getQrCodeStatus(qr.expirationDate, now)]++;
		}
		return acc;
	}, [qrCodes]);

	const filteredData = useMemo(() => {
		if (filter === "all") return qrCodes;
		const now = new Date();
		return qrCodes.filter(
			(qr) => getQrCodeStatus(qr.expirationDate, now) === filter,
		);
	}, [qrCodes, filter]);

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap gap-2">
				{filterOptions.map((option) => (
					<Button
						key={option.value}
						type="button"
						size="sm"
						variant={filter === option.value ? "default" : "outline"}
						onClick={() => setFilter(option.value)}
					>
						{option.label}
						<span className="ml-2 text-xs opacity-80">
							{counts[option.value]}
						</span>
					</Button>
				))}
			</div>
			<DataTable
				columns={columns}
				columnTitles={columnTitles}
				data={filteredData}
				initialState={{
					columnFilters: [],
				}}
			/>
		</div>
	);
}
