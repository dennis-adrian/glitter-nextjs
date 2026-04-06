import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import OrderDetailActions from "@/app/components/organisms/orders/order-detail-actions";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { fetchOrder } from "@/app/lib/orders/actions";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import {
	AlertTriangleIcon,
	ArrowLeftIcon,
	PackageIcon,
	UserIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

function formatCurrency(amount: number) {
	return `Bs. ${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`;
}

function VoucherCard({ url }: { url: string }) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Comprobante de pago</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="relative aspect-4/3 overflow-hidden rounded-lg border bg-muted">
					<Image
						src={url}
						alt="Comprobante de pago"
						fill
						className="object-contain p-2"
						sizes="(max-width: 1024px) 100vw, 400px"
					/>
				</div>
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm font-medium text-primary hover:underline"
				>
					Abrir en pantalla completa →
				</a>
			</CardContent>
		</Card>
	);
}

export default async function OrderDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const orderId = parseInt(id, 10);
	if (isNaN(orderId)) notFound();

	const order = await fetchOrder(orderId);
	if (!order) notFound();

	const customerName =
		order.customer?.displayName ?? order.guestName ?? "Invitado";
	const customerEmail = order.customer?.email ?? order.guestEmail ?? "—";
	const customerPhone =
		order.customer?.phoneNumber ?? order.guestPhone ?? "No registrado";

	const nowInStore = DateTime.now().setZone(STORE_TIMEZONE);
	const isOverdue =
		!!order.paymentDueDate &&
		formatDate(order.paymentDueDate) < nowInStore &&
		(order.status === "pending" || order.status === "payment_verification");

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<Link
						href="/dashboard/store/orders"
						className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeftIcon className="h-4 w-4" />
						Pedidos
					</Link>
					<span className="text-muted-foreground">/</span>
					<span className="font-semibold">Pedido #{order.id}</span>
				</div>
				<div className="flex items-center gap-3">
					<OrderStatusBadge status={order.status} />
					{/* Desktop-only dropdown — actions button visible on all sizes as overflow menu */}
					<OrdersActionsCell order={order} />
				</div>
			</div>

			{/* Primary action buttons — prominent on mobile, supplementary on desktop */}
			<OrderDetailActions order={order} />

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				{/* Left column */}
				<div className="space-y-6 lg:col-span-2">
					{/* Customer */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<UserIcon className="h-4 w-4 text-muted-foreground" />
								Cliente
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-1 text-sm">
							<p className="font-medium">{customerName}</p>
							<p className="text-muted-foreground">{customerEmail}</p>
							<p className="text-muted-foreground">{customerPhone}</p>
							{!order.customer && (
								<p className="text-xs text-muted-foreground mt-1">
									Compra como invitado
								</p>
							)}
						</CardContent>
					</Card>

					{/* Order items */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<PackageIcon className="h-4 w-4 text-muted-foreground" />
								Artículos
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{order.orderItems.map((item) => {
								const mainImage = item.product.images.find((i) => i.isMain);
								const imageUrl =
									mainImage?.imageUrl ?? item.product.images[0]?.imageUrl;
								const subtotal = item.quantity * item.priceAtPurchase;

								return (
									<div key={item.id} className="flex items-center gap-3">
										<div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
											{imageUrl ? (
												<Image
													src={imageUrl}
													alt={item.product.name}
													fill
													className="object-cover"
												/>
											) : (
												<div className="flex h-full items-center justify-center text-xs text-muted-foreground">
													—
												</div>
											)}
										</div>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium leading-tight">
												{item.product.name}
											</p>
											<p className="text-xs text-muted-foreground">
												{item.quantity} × {formatCurrency(item.priceAtPurchase)}
											</p>
										</div>
										<p className="text-sm font-semibold shrink-0">
											{formatCurrency(subtotal)}
										</p>
									</div>
								);
							})}
							<div className="border-t pt-3 flex justify-between text-sm font-semibold">
								<span>Total</span>
								<span>{formatCurrency(order.totalAmount)}</span>
							</div>
						</CardContent>
					</Card>

					{/* Voucher — mobile position (after items, before dates) */}
					{order.paymentVoucherUrl && (
						<div className="lg:hidden">
							<VoucherCard url={order.paymentVoucherUrl} />
						</div>
					)}
				</div>

				{/* Right column */}
				<div className="space-y-6">
					{/* Dates */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Fechas</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div className="flex justify-between gap-2">
								<span className="text-muted-foreground">Creado</span>
								<span className="text-right capitalize">
									{formatDate(order.createdAt).toLocaleString(
										DateTime.DATETIME_MED,
									)}
								</span>
							</div>
							{order.paymentDueDate && (
								<div className="flex justify-between gap-2">
									<span className="text-muted-foreground shrink-0">
										Límite de pago
									</span>
									<span
										className={`text-right flex items-center gap-1 capitalize ${isOverdue ? "text-red-600 font-medium" : ""}`}
									>
										{isOverdue && (
											<AlertTriangleIcon className="h-3 w-3 shrink-0" />
										)}
										{formatDate(order.paymentDueDate).toLocaleString(
											DateTime.DATETIME_MED,
										)}
									</span>
								</div>
							)}
							{order.voucherSubmittedAt && (
								<div className="flex justify-between gap-2">
									<span className="text-muted-foreground shrink-0">
										Comprobante subido
									</span>
									<span className="text-right capitalize">
										{formatDate(order.voucherSubmittedAt).toLocaleString(
											DateTime.DATETIME_MED,
										)}
									</span>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Voucher — desktop position */}
					{order.paymentVoucherUrl && (
						<div className="hidden lg:block">
							<VoucherCard url={order.paymentVoucherUrl} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
