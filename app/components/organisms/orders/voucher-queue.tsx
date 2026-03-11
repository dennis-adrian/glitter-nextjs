"use client";

import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import OrderVoucherDialog from "@/app/components/organisms/orders/order-voucher-dialog";
import UpdateOrderStatusModal from "@/app/components/organisms/orders/update-order-status-modal";
import { Button } from "@/app/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import { CheckCheckIcon, ClipboardCheckIcon, XCircleIcon } from "lucide-react";
import { DateTime } from "luxon";
import { use, useState } from "react";

type VoucherQueueProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
};

function VoucherCard({ order }: { order: OrderWithRelations }) {
	const [actionStatus, setActionStatus] = useState<OrderStatus | null>(null);
	const [openModal, setOpenModal] = useState(false);

	return (
		<>
			<Card>
				<CardHeader className="p-4 pb-2">
					<div className="flex items-start justify-between gap-2">
						<div>
							<p className="text-sm font-semibold">
								Pedido #{order.id}
							</p>
							<p className="text-sm text-muted-foreground">
								{order.customer.displayName}
							</p>
						</div>
						<OrderStatusBadge status={order.status} />
					</div>
				</CardHeader>
				<CardContent className="p-4 pt-0 flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<span className="font-medium">
							Bs {order.totalAmount.toFixed(2)}
						</span>
						<span className="text-xs text-muted-foreground capitalize">
							{formatDate(order.createdAt).toLocaleString(
								DateTime.DATE_MED,
							)}
						</span>
					</div>
					{order.paymentVoucherUrl && (
						<OrderVoucherDialog
							voucherUrl={order.paymentVoucherUrl}
							orderId={order.id}
						/>
					)}
					<div className="flex gap-2">
						<Button
							className="w-full"
							variant="outline"
							size="sm"
							onClick={() => {
								setActionStatus("paid");
								setOpenModal(true);
							}}
						>
							<CheckCheckIcon className="h-4 w-4 mr-1" />
							Aprobar pago
						</Button>
						<Button
							className="w-full"
							variant="destructive"
							size="sm"
							onClick={() => {
								setActionStatus("cancelled");
								setOpenModal(true);
							}}
						>
							<XCircleIcon className="h-4 w-4 mr-1" />
							Rechazar
						</Button>
					</div>
				</CardContent>
			</Card>
			<UpdateOrderStatusModal
				order={order}
				open={openModal}
				newStatus={actionStatus}
				setOpen={setOpenModal}
			/>
		</>
	);
}

export default function VoucherQueue({ ordersPromise }: VoucherQueueProps) {
	const orders = use(ordersPromise);
	const pendingVouchers = orders.filter(
		(o) => o.status === "payment_verification",
	);

	if (pendingVouchers.length === 0) return null;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<ClipboardCheckIcon className="h-5 w-5 text-amber-600" />
				<h2 className="text-lg font-semibold">
					Comprobantes pendientes ({pendingVouchers.length})
				</h2>
			</div>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{pendingVouchers.map((order) => (
					<VoucherCard key={order.id} order={order} />
				))}
			</div>
		</div>
	);
}
