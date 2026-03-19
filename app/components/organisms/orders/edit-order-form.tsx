"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { updateOrder, UpdateOrderItemInput } from "@/app/lib/orders/actions";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { BaseModal } from "@/app/components/modals/base-modal";
import Heading from "@/app/components/atoms/heading";

// ─── Types ────────────────────────────────────────────────────────────────────

type EditableItem = {
	orderItemId: number;
	productId: number;
	productName: string;
	imageUrl: string;
	priceAtPurchase: number;
	isReadOnly: boolean; // true when current price ≠ priceAtPurchase
	originalQuantity: number;
	quantity: number;
	isRemoved: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initItems(order: OrderWithRelations): EditableItem[] {
	return order.orderItems.map((item) => {
		const currentPrice = getProductPriceAtPurchase(item.product);
		const mainImage = item.product.images.find((img) => img.isMain);
		const imageUrl =
			mainImage?.imageUrl ??
			item.product.images[0]?.imageUrl ??
			PLACEHOLDER_IMAGE_URLS["300"];

		return {
			orderItemId: item.id,
			productId: item.productId,
			productName: item.product.name,
			imageUrl,
			priceAtPurchase: item.priceAtPurchase,
			isReadOnly: Math.abs(currentPrice - item.priceAtPurchase) > 0.001,
			originalQuantity: item.quantity,
			quantity: item.quantity,
			isRemoved: false,
		};
	});
}

// ─── Sub-component: single item row ───────────────────────────────────────────

function EditOrderItemRow({
	item,
	onQuantityChange,
	onRemove,
	onUndoRemove,
}: {
	item: EditableItem;
	onQuantityChange: (id: number, value: number) => void;
	onRemove: (id: number) => void;
	onUndoRemove: (id: number) => void;
}) {
	return (
		<div
			className={`flex gap-4 py-4 border-b last:border-b-0 transition-opacity ${
				item.isRemoved ? "opacity-50" : ""
			}`}
		>
			{/* Product image */}
			<div className="h-20 w-20 rounded-md overflow-hidden bg-gray-100 shrink-0">
				<Image
					src={item.imageUrl}
					alt={item.productName}
					width={80}
					height={80}
					className="object-cover w-full h-full"
				/>
			</div>

			{/* Product info + controls */}
			<div className="flex-1 flex flex-col gap-1">
				<div className="flex justify-between items-start gap-2">
					<p
						className={`font-medium text-sm ${
							item.isRemoved ? "line-through text-muted-foreground" : ""
						}`}
					>
						{item.productName}
					</p>
					<p className="font-medium text-sm shrink-0">
						Bs{(item.priceAtPurchase * item.quantity).toFixed(2)}
					</p>
				</div>

				<p className="text-xs text-muted-foreground">
					Bs{item.priceAtPurchase.toFixed(2)} c/u
				</p>

				{/* Price-lock notice */}
				{item.isReadOnly && !item.isRemoved && (
					<p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
						El precio de este producto cambió. No es posible modificar su
						cantidad.
					</p>
				)}

				{/* Controls */}
				<div className="flex items-center gap-2 mt-1">
					{item.isRemoved ? (
						<button
							type="button"
							onClick={() => onUndoRemove(item.orderItemId)}
							className="text-xs text-purple-600 hover:underline"
						>
							Deshacer
						</button>
					) : item.isReadOnly ? (
						<span className="text-sm text-muted-foreground">
							Cantidad: {item.quantity}
						</span>
					) : (
						<>
							{/* Quantity controls */}
							<div className="flex items-center gap-1">
								<Button
									type="button"
									variant="outline"
									size="icon"
									className="h-7 w-7"
									onClick={() =>
										onQuantityChange(item.orderItemId, item.quantity - 1)
									}
									disabled={item.quantity <= 1}
								>
									<MinusIcon className="h-3 w-3" />
								</Button>
								<Input
									type="number"
									className="h-7 w-14 text-center text-sm"
									value={item.quantity}
									min={1}
									onChange={(e) =>
										onQuantityChange(
											item.orderItemId,
											parseInt(e.target.value) || 1,
										)
									}
								/>
								<Button
									type="button"
									variant="outline"
									size="icon"
									className="h-7 w-7"
									onClick={() =>
										onQuantityChange(item.orderItemId, item.quantity + 1)
									}
								>
									<PlusIcon className="h-3 w-3" />
								</Button>
							</div>

							{/* Remove button */}
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
								onClick={() => onRemove(item.orderItemId)}
								aria-label={`Eliminar ${item.productName}`}
							>
								<Trash2Icon className="h-4 w-4" />
							</Button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

type EditOrderFormProps = {
	order: OrderWithRelations;
	profileId: number;
};

export default function EditOrderForm({
	order,
	profileId,
}: EditOrderFormProps) {
	const router = useRouter();

	const [items, setItems] = useState<EditableItem[]>(() => initItems(order));
	const [showCancelModal, setShowCancelModal] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [conflictError, setConflictError] = useState(false);

	// Derived state
	const isDirty = items.some(
		(i) => i.isRemoved || i.quantity !== i.originalQuantity,
	);
	const activeItems = items.filter((i) => !i.isRemoved);
	const newTotal = activeItems.reduce(
		(acc, i) => acc + i.priceAtPurchase * i.quantity,
		0,
	);

	const orderDetailUrl = `/profiles/${profileId}/orders/${order.id}`;

	// beforeunload guard for browser tab close / reload
	useEffect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (isDirty && !isSubmitting) {
				e.preventDefault();
			}
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [isDirty, isSubmitting]);

	// ── Handlers ────────────────────────────────────────────────────────────

	const handleQuantityChange = (id: number, value: number) => {
		const clamped = Math.max(1, value || 1);
		setItems((prev) =>
			prev.map((item) =>
				item.orderItemId === id ? { ...item, quantity: clamped } : item,
			),
		);
	};

	const handleRemoveItem = (id: number) => {
		setItems((prev) => {
			const next = prev.map((item) =>
				item.orderItemId === id ? { ...item, isRemoved: true } : item,
			);
			const remaining = next.filter((i) => !i.isRemoved);
			if (remaining.length === 0) {
				setTimeout(() => setShowCancelModal(true), 0);
			}
			return next;
		});
	};

	const handleUndoRemove = (id: number) => {
		setItems((prev) =>
			prev.map((item) =>
				item.orderItemId === id ? { ...item, isRemoved: false } : item,
			),
		);
	};

	const handleDiscard = () => {
		if (isDirty) {
			const confirmed = window.confirm(
				"Tenés cambios sin guardar. ¿Querés descartarlos?",
			);
			if (!confirmed) return;
		}
		router.push(orderDetailUrl);
	};

	const handleSave = async () => {
		setIsSubmitting(true);
		setConflictError(false);

		const payload: UpdateOrderItemInput[] = items.map((item) => ({
			orderItemId: item.orderItemId,
			quantity: item.isRemoved ? 0 : item.quantity,
		}));

		const result = await updateOrder(
			order.id,
			profileId,
			payload,
			order.updatedAt.toISOString(),
		);

		setIsSubmitting(false);

		if (result.success) {
			toast.success(result.message);
			if (result.wasCancelled) {
				router.push("/my_orders");
			} else {
				router.push(orderDetailUrl);
			}
		} else {
			if (result.cause === "conflict") {
				setConflictError(true);
			}
			toast.error(result.message || "No se pudo actualizar el pedido.");
		}
	};

	const handleCancelOrderConfirmed = () => {
		setShowCancelModal(false);
		handleSave();
	};

	const handleCancelModalBack = () => {
		setShowCancelModal(false);
		// Restore all items so the user is back to a non-empty state
		setItems((prev) => prev.map((i) => ({ ...i, isRemoved: false })));
	};

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-col gap-4 md:gap-6">
			{/* Header */}
			<div>
				<Link
					href={orderDetailUrl}
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
				>
					<ArrowLeftIcon className="h-4 w-4" />
					Volver al pedido
				</Link>
				<Heading level={2}>Editar pedido #{order.id}</Heading>
			</div>

			{/* Conflict error alert */}
			{conflictError && (
				<Alert variant="destructive">
					<AlertDescription>
						El pedido fue modificado en otra sesión.{" "}
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="underline font-medium"
						>
							Recargá la página
						</button>{" "}
						para ver los cambios más recientes.
					</AlertDescription>
				</Alert>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
				{/* Items list */}
				<div className="lg:col-span-2 bg-white rounded-xl shadow-xs border p-6">
					<Heading level={3}>Artículos</Heading>
					<p className="text-sm text-muted-foreground mb-4">
						Podés ajustar las cantidades o eliminar artículos. No es posible
						agregar nuevos productos a un pedido existente.
					</p>
					<div>
						{items.map((item) => (
							<EditOrderItemRow
								key={item.orderItemId}
								item={item}
								onQuantityChange={handleQuantityChange}
								onRemove={handleRemoveItem}
								onUndoRemove={handleUndoRemove}
							/>
						))}
					</div>
				</div>

				{/* Summary + actions */}
				<div>
					<Card>
						<CardContent className="p-6 flex flex-col gap-4">
							<div>
								<p className="text-sm text-muted-foreground mb-1">
									Nuevo total
								</p>
								<p className="text-2xl font-bold">Bs{newTotal.toFixed(2)}</p>
								{isDirty && (
									<p className="text-xs text-muted-foreground">
										Original: Bs{order.totalAmount.toFixed(2)}
									</p>
								)}
							</div>

							<Button
								onClick={handleSave}
								disabled={!isDirty || isSubmitting}
								className="w-full bg-purple-600 hover:bg-purple-700"
							>
								{isSubmitting ? "Guardando..." : "Guardar cambios"}
							</Button>

							<Button
								variant="outline"
								onClick={handleDiscard}
								disabled={isSubmitting}
								className="w-full"
							>
								Descartar
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Last-item removal confirmation modal */}
			<BaseModal
				title="¿Cancelar pedido?"
				show={showCancelModal}
				onOpenChange={(open) => {
					if (!open) handleCancelModalBack();
				}}
				description="Eliminaste todos los artículos. Si guardás, el pedido será cancelado y el stock será restaurado."
			>
				<div className="flex flex-col gap-2 mt-2">
					<Button
						variant="destructive"
						onClick={handleCancelOrderConfirmed}
						className="w-full"
					>
						Sí, cancelar pedido
					</Button>
					<Button
						variant="outline"
						onClick={handleCancelModalBack}
						className="w-full"
					>
						Volver
					</Button>
				</div>
			</BaseModal>
		</div>
	);
}
