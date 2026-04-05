"use client";

import DeleteProductModal from "@/app/components/organisms/products/delete-product-modal";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Switch } from "@/app/components/ui/switch";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { toggleProductVisibility, updateProductStock } from "@/app/lib/products/actions";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { EditIcon, StarIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
	available: "Disponible",
	presale: "Preventa",
	sale: "En oferta",
};

export const columnTitles = {
	image: "Imagen",
	name: "Nombre",
	price: "Precio",
	stock: "Stock",
	status: "Estado",
	isFeatured: "Destacado",
	isVisible: "Visible",
	actions: "",
};

function VisibilityToggle({ product }: { product: BaseProductWithImages }) {
	const [visible, setVisible] = useState(product.isVisible);
	const [loading, setLoading] = useState(false);

	async function handleToggle(checked: boolean) {
		const prev = visible;
		setLoading(true);
		setVisible(checked);
		try {
			const result = await toggleProductVisibility(product.id, checked);
			if (!result.success) {
				setVisible(prev);
				toast.error(result.message);
			}
		} catch (error) {
			setVisible(prev);
			console.error(error);
			toast.error("No se pudo actualizar la visibilidad.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Switch
			checked={visible}
			onCheckedChange={handleToggle}
			disabled={loading}
			aria-label={visible ? "Ocultar producto" : "Mostrar producto"}
		/>
	);
}

function StockCell({ product }: { product: BaseProductWithImages }) {
	const [stock, setStock] = useState(product.stock ?? 0);
	const [editing, setEditing] = useState(false);
	const [inputValue, setInputValue] = useState(String(stock));
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	function handleBadgeClick() {
		setInputValue(String(stock));
		setEditing(true);
		setTimeout(() => inputRef.current?.select(), 0);
	}

	async function handleCommit() {
		const parsed = parseInt(inputValue, 10);
		const newStock = isNaN(parsed) || parsed < 0 ? stock : parsed;
		setEditing(false);
		if (newStock === stock) return;

		const prev = stock;
		setStock(newStock);
		setLoading(true);
		try {
			const result = await updateProductStock(product.id, newStock);
			if (!result.success) {
				setStock(prev);
				toast.error(result.message);
			}
		} catch {
			setStock(prev);
			toast.error("No se pudo actualizar el stock.");
		} finally {
			setLoading(false);
		}
	}

	if (editing) {
		return (
			<Input
				ref={inputRef}
				type="number"
				min={0}
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onBlur={handleCommit}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleCommit();
					if (e.key === "Escape") setEditing(false);
				}}
				className="h-7 w-16 px-2 text-sm"
				disabled={loading}
			/>
		);
	}

	return (
		<Badge
			variant="outline"
			className={cn(
				"cursor-pointer",
				stock === 0
					? "border-red-300 text-red-600"
					: stock <= 5
						? "border-amber-300 text-amber-600"
						: "border-green-300 text-green-600",
			)}
			onClick={handleBadgeClick}
		>
			{stock}
		</Badge>
	);
}

function ActionsCell({ product }: { product: BaseProductWithImages }) {
	const [openDelete, setOpenDelete] = useState(false);

	return (
		<div className="flex items-center gap-1">
			<Button asChild variant="ghost" size="icon" className="h-8 w-8">
				<Link
					href={`/dashboard/store/products/${product.id}/edit`}
					aria-label={`Editar ${product.name}`}
				>
					<EditIcon className="h-4 w-4" />
				</Link>
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8 text-destructive hover:text-destructive"
				aria-label={`Eliminar ${product.name}`}
				onClick={() => setOpenDelete(true)}
			>
				<Trash2Icon className="h-4 w-4" />
			</Button>
			<DeleteProductModal
				product={product}
				open={openDelete}
				setOpen={setOpenDelete}
			/>
		</div>
	);
}

export const columns: ColumnDef<BaseProductWithImages>[] = [
	{
		accessorKey: "image",
		header: () => <span>{columnTitles.image}</span>,
		cell: ({ row }) => {
			const mainImage = row.original.images.find((img) => img.isMain);
			const firstImage = row.original.images[0];
			const imageUrl = mainImage?.imageUrl ?? firstImage?.imageUrl;

			return imageUrl ? (
				<div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border">
					<Image
						src={imageUrl}
						alt={row.original.name}
						fill
						className="object-cover"
					/>
				</div>
			) : (
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
					—
				</div>
			);
		},
		enableSorting: false,
	},
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.name} />
		),
	},
	{
		accessorKey: "price",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.price} />
		),
		cell: ({ row }) => `Bs ${row.original.price.toFixed(2)}`,
	},
	{
		accessorKey: "stock",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.stock} />
		),
		cell: ({ row }) => <StockCell product={row.original} />,
	},
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.status} />
		),
		cell: ({ row }) => (
			<Badge variant="outline">
				{STATUS_LABELS[row.original.status] ?? row.original.status}
			</Badge>
		),
		filterFn: (row, _columnId, filterValue: string[]) => {
			if (filterValue.length === 0) return true;
			return filterValue.includes(row.original.status);
		},
	},
	{
		accessorKey: "isFeatured",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.isFeatured} />
		),
		cell: ({ row }) =>
			row.original.isFeatured ? (
				<StarIcon className="h-4 w-4 text-amber-500 fill-amber-500" />
			) : null,
	},
	{
		accessorKey: "isVisible",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.isVisible} />
		),
		cell: ({ row }) => <VisibilityToggle product={row.original} />,
	},
	{
		accessorKey: "actions",
		header: () => null,
		cell: ({ row }) => <ActionsCell product={row.original} />,
		enableSorting: false,
		enableHiding: false,
	},
];
