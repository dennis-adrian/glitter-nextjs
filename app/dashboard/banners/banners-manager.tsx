"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import type { MarketingBannerRow } from "@/app/lib/marketing_banners/definitions";
import {
	deleteMarketingBanner,
	reorderMarketingBanners,
	setMarketingBannerVisible,
} from "@/app/lib/marketing_banners/actions";
import { cn } from "@/app/lib/utils";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

const AUDIENCE_OPTIONS: { value: MarketingBannerRow["audience"]; label: string }[] = [
	{ value: "all", label: "Todos (landing y portal)" },
	{ value: "public_only", label: "Solo visitantes (landing, sin sesión)" },
	{ value: "participants_only", label: "Solo participantes (portal)" },
];

type Props = { initialBanners: MarketingBannerRow[] };

function SortableRow({
	banner,
	onDelete,
	onToggleVisible,
}: {
	banner: MarketingBannerRow;
	onDelete: () => void;
	onToggleVisible: (v: boolean) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: banner.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center",
				isDragging && "z-10 opacity-80 shadow-md",
			)}
		>
			<div className="flex flex-1 items-center gap-3 min-w-0">
				<button
					type="button"
					className="shrink-0 touch-none text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
					{...attributes}
					{...listeners}
					aria-label="Arrastrar para reordenar"
				>
					<GripVerticalIcon className="size-5" />
				</button>
				<div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
					{banner.imageUrl ? (
						<Image
							src={banner.imageUrl}
							alt=""
							fill
							className="object-cover"
							sizes="80px"
						/>
					) : null}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-sm">
						{banner.label || `Banner #${banner.id}`}
					</p>
					<p className="truncate text-xs text-muted-foreground" title={banner.href}>
						{banner.href}
					</p>
					<p className="text-xs text-muted-foreground">
						{AUDIENCE_OPTIONS.find((o) => o.value === banner.audience)?.label}
					</p>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2 sm:justify-end">
				<div className="flex items-center gap-2">
					<Label
						htmlFor={`vis-${banner.id}`}
						className="text-xs text-muted-foreground whitespace-nowrap"
					>
						Visible
					</Label>
					<Switch
						id={`vis-${banner.id}`}
						checked={banner.isVisible}
						onCheckedChange={onToggleVisible}
					/>
				</div>
				<Button variant="outline" size="sm" asChild>
					<Link href={`/dashboard/banners/${banner.id}/edit`}>
						<PencilIcon className="size-4 mr-1" />
						Editar
					</Link>
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onDelete}>
					<Trash2Icon className="size-4 text-destructive" />
				</Button>
			</div>
		</div>
	);
}

export default function BannersManager({ initialBanners }: Props) {
	const router = useRouter();
	const [items, setItems] = useState(initialBanners);
	const [isPending, startTransition] = useTransition();
	const [deleteId, setDeleteId] = useState<number | null>(null);

	useEffect(() => {
		setItems(initialBanners);
	}, [initialBanners]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = items.findIndex((i) => i.id === active.id);
		const newIndex = items.findIndex((i) => i.id === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const previous = items;
		const newItems = arrayMove(items, oldIndex, newIndex);
		setItems(newItems);
		startTransition(async () => {
			const res = await reorderMarketingBanners(newItems.map((b) => b.id));
			if (!res.success) {
				toast.error(res.message);
				setItems(previous);
			} else {
				router.refresh();
			}
		});
	}

	function confirmDelete() {
		if (deleteId == null) return;
		const id = deleteId;
		startTransition(async () => {
			const res = await deleteMarketingBanner(id);
			setDeleteId(null);
			if (!res.success) {
				toast.error(res.message);
				return;
			}
			toast.success("Banner eliminado");
			router.refresh();
		});
	}

	return (
		<div className="space-y-4">
			<div>
				<Button type="button" asChild>
					<Link href="/dashboard/banners/new">
						<PlusIcon className="size-4 mr-2" />
						Nuevo banner
					</Link>
				</Button>
			</div>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={items.map((b) => b.id)}
					strategy={verticalListSortingStrategy}
				>
					<div className="flex flex-col gap-2">
						{items.length === 0 && (
							<p className="text-sm text-muted-foreground">
								No hay banners. Crea uno para el carrusel de la página de inicio y el
								portal.
							</p>
						)}
						{items.map((b) => (
							<SortableRow
								key={b.id}
								banner={b}
								onDelete={() => setDeleteId(b.id)}
								onToggleVisible={(v) => {
									startTransition(async () => {
										const res = await setMarketingBannerVisible(b.id, v);
										if (!res.success) {
											toast.error(res.message);
											return;
										}
										setItems((prev) =>
											prev.map((x) => (x.id === b.id ? { ...x, isVisible: v } : x)),
										);
										router.refresh();
									});
								}}
							/>
						))}
					</div>
				</SortableContext>
			</DndContext>

			<AlertDialog open={deleteId != null} onOpenChange={() => setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Eliminar este banner?</AlertDialogTitle>
						<AlertDialogDescription>
							Se quitará del carrusel. Esta acción no se puede deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Eliminar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
