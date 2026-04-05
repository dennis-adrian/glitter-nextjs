"use client";

import {
	columns,
	columnTitles,
} from "@/app/components/organisms/products/table-columns";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import {
	bulkDeleteProducts,
	bulkToggleProductVisibility,
} from "@/app/lib/products/actions";
import type { Table } from "@tanstack/react-table";
import { EyeIcon, EyeOffIcon, Trash2Icon } from "lucide-react";
import { use, useState } from "react";
import { toast } from "sonner";

type ProductsTableProps = {
	productsPromise: Promise<BaseProductWithImages[]>;
};

function BulkActionsToolbar({ table }: { table: Table<BaseProductWithImages> }) {
	const selected = table.getSelectedRowModel().rows;
	const [loading, setLoading] = useState(false);

	if (selected.length === 0) return null;

	const ids = selected.map((row) => row.original.id);

	async function handleToggle(visible: boolean) {
		setLoading(true);
		try {
			const result = await bulkToggleProductVisibility(ids, visible);
			if (result.success) {
				toast.success(result.message);
				table.resetRowSelection();
			} else {
				toast.error(result.message);
			}
		} catch {
			toast.error("No se pudo actualizar la visibilidad.");
		} finally {
			setLoading(false);
		}
	}

	async function handleDelete() {
		setLoading(true);
		try {
			const result = await bulkDeleteProducts(ids);
			if (result.success) {
				toast.success(result.message);
				table.resetRowSelection();
			} else {
				toast.error(result.message);
			}
		} catch {
			toast.error("No se pudo eliminar los productos.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex items-center gap-2">
			<span className="text-sm text-muted-foreground">
				{selected.length} seleccionado{selected.length !== 1 ? "s" : ""}
			</span>
			<Button
				size="sm"
				variant="outline"
				disabled={loading}
				onClick={() => handleToggle(true)}
			>
				<EyeIcon className="h-4 w-4 mr-1" />
				Mostrar
			</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={loading}
				onClick={() => handleToggle(false)}
			>
				<EyeOffIcon className="h-4 w-4 mr-1" />
				Ocultar
			</Button>
			<Button
				size="sm"
				variant="outline"
				className="text-destructive border-destructive/30 hover:bg-destructive/10"
				disabled={loading}
				onClick={handleDelete}
			>
				<Trash2Icon className="h-4 w-4 mr-1" />
				Eliminar
			</Button>
		</div>
	);
}

export default function ProductsTable({ productsPromise }: ProductsTableProps) {
	const products = use(productsPromise);

	return (
		<DataTable
			columns={columns}
			data={products}
			columnTitles={columnTitles}
			selectable
			filters={[
				{
					columnId: "status",
					label: "Estado",
					options: [
						{ value: "available", label: "Disponible" },
						{ value: "presale", label: "Preventa" },
						{ value: "sale", label: "En oferta" },
					],
				},
			]}
			actions={(table) => <BulkActionsToolbar table={table} />}
		/>
	);
}
