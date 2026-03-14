"use client";

import Image from "next/image";
import { useState } from "react";
import {
	CheckIcon,
	ChevronRightIcon,
	CircleCheckIcon,
	ExternalLinkIcon,
	XIcon,
} from "lucide-react";

import UpdateOrderStatusModal from "@/app/components/organisms/orders/update-order-status-modal";
import { Button } from "@/app/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/components/ui/dialog";
import { formatDateWithTime } from "@/app/lib/formatters";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";

type OrderVoucherReviewDialogProps = {
	order: OrderWithRelations;
	trigger?: React.ReactNode;
};

function formatCurrency(amount: number) {
	const amountLabel = Number.isInteger(amount)
		? amount.toFixed(0)
		: amount.toFixed(2);

	return `Bs. ${amountLabel}`;
}

export default function OrderVoucherReviewDialog({
	order,
	trigger,
}: OrderVoucherReviewDialogProps) {
	const [openDialog, setOpenDialog] = useState(false);
	const [openStatusModal, setOpenStatusModal] = useState(false);
	const [actionStatus, setActionStatus] = useState<OrderStatus | null>(null);

	if (!order.paymentVoucherUrl) {
		return null;
	}

	const orderLabel = `Orden #${String(order.id).padStart(3, "0")}`;
	const productCount = order.orderItems.length;
	const productCountLabel = `${productCount} ${
		productCount === 1 ? "producto" : "productos"
	}`;

	return (
		<>
			<Dialog open={openDialog} onOpenChange={setOpenDialog}>
				<DialogTrigger asChild>
					{trigger ?? (
						<button
							type="button"
							className="group w-full rounded-2xl border border-primary/20 bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:bg-muted/20 hover:shadow-md"
						>
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<p className="text-lg font-semibold tracking-tight">
											{orderLabel}
										</p>
										<span className="text-sm text-muted-foreground">
											{order.customer.displayName}
										</span>
									</div>

									<div className="space-y-1 text-sm text-muted-foreground">
										<p>{productCountLabel}</p>
										<p className="font-medium text-primary">
											Total: {formatCurrency(order.totalAmount)}
										</p>
										<p>
											Subido:{" "}
											{order.voucherSubmittedAt
												? formatDateWithTime(order.voucherSubmittedAt)
												: "—"}
										</p>
									</div>
								</div>

								<div className="flex items-center gap-2 text-muted-foreground transition-colors group-hover:text-primary">
									<span className="hidden text-sm font-medium sm:inline">
										Revisar
									</span>
									<ChevronRightIcon className="h-5 w-5" />
								</div>
							</div>
						</button>
					)}
				</DialogTrigger>

				<DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
					<div className="shrink-0 border-b px-5 py-5 md:px-6">
						<DialogHeader className="pr-8">
							<DialogTitle>Verificar Comprobante de Pago</DialogTitle>
							<DialogDescription>
								{orderLabel} - {order.customer.displayName}
							</DialogDescription>
						</DialogHeader>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
						<div className="space-y-4">
							<Card className="border-border/70 bg-muted/20">
								<CardHeader className="pb-3">
									<CardTitle className="text-base md:text-lg">
										Resumen del pedido
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-3">
									<div className="flex flex-col gap-2 text-xs md:text-sm">
										{order.orderItems.map((item) => (
											<div
												key={item.id}
												className="flex items-center justify-between gap-3"
											>
												<p className="text-muted-foreground">
													{item.quantity}x {item.product.name}
												</p>
												<p className="font-medium">
													{formatCurrency(item.quantity * item.priceAtPurchase)}
												</p>
											</div>
										))}
									</div>

									<div className="flex items-center justify-between border-t pt-2 text-sm md:text-base font-semibold">
										<p>Total</p>
										<p className="text-primary">
											{formatCurrency(order.totalAmount)}
										</p>
									</div>
								</CardContent>
							</Card>

							<Card className="border-border/70 bg-muted/20">
								<CardHeader className="pb-3">
									<CardTitle className="text-base md:text-lg">
										Comprobante
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-3">
									<div className="relative aspect-4/3 overflow-hidden rounded-xl border bg-muted">
										<Image
											src={order.paymentVoucherUrl}
											alt={`Comprobante de pago de la orden ${orderLabel}`}
											fill
											className="object-contain p-3"
											sizes="(max-width: 768px) 100vw, 720px"
										/>
									</div>

									<a
										href={order.paymentVoucherUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
									>
										<ExternalLinkIcon className="h-3.5 w-3.5" />
										Abrir en pantalla completa
									</a>
								</CardContent>
							</Card>

							<Card className="border-border/70 bg-muted/20">
								<CardHeader className="pb-3">
									<CardTitle className="text-base md:text-lg">
										Datos del Cliente
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
									<p>{order.customer.displayName}</p>
									<p>{order.customer.email}</p>
									<p>{order.customer.phoneNumber || "No registrado"}</p>
								</CardContent>
							</Card>
						</div>
					</div>

					<DialogFooter className="flex px-5 py-4 md:px-6 border-t">
						<Button
							className="w-full sm:flex-1"
							onClick={() => {
								setActionStatus("paid");
								setOpenStatusModal(true);
							}}
						>
							<CircleCheckIcon className="mr-1 h-4 w-4" />
							Aprobar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<UpdateOrderStatusModal
				order={order}
				open={openStatusModal}
				newStatus={actionStatus}
				setOpen={setOpenStatusModal}
				onSuccess={() => setOpenDialog(false)}
			/>
		</>
	);
}
