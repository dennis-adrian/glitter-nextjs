"use client";

import OrderVoucherReviewDialog from "@/app/components/organisms/orders/order-voucher-review-dialog";
import {
	voucherColumns,
	voucherColumnTitles,
} from "@/app/components/organisms/orders/voucher-table-columns";
import { Card, CardContent } from "@/app/components/ui/card";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { ClipboardCheckIcon } from "lucide-react";
import { use } from "react";
import Heading from "@/app/components/atoms/heading";
import { Badge } from "@/app/components/ui/badge";

type VoucherQueueProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
};

export default function VoucherQueue({ ordersPromise }: VoucherQueueProps) {
	const orders = use(ordersPromise);
	const pendingVouchers = orders
		.filter((o) => o.status === "payment_verification")
		.sort((a, b) => {
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		});

	return (
		<div className="flex flex-col gap-6">
			<div className="space-y-1">
				<div className="flex justify-between items-center flex-wrap-reverse gap-2">
					<Heading level={3}>Comprobantes de pago</Heading>
					<Badge
						variant="outline"
						className="text-primary border-primary px-2.5 py-1 text-xs md:text-sm"
					>
						{pendingVouchers.length}{" "}
						{pendingVouchers.length === 1 ? "pendiente" : "pendientes"}
					</Badge>
				</div>
				<p className="max-w-2xl text-sm text-muted-foreground md:text-base">
					Revisa los comprobantes subidos por clientes, valida el resumen de
					cada pedido y aprueba o rechaza el pago desde un solo lugar.
				</p>
			</div>

			{pendingVouchers.length === 0 ? (
				<Card className="border-dashed border-border/70">
					<CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
						<div className="rounded-full bg-primary/10 p-3 text-primary">
							<ClipboardCheckIcon className="h-6 w-6" />
						</div>
						<div className="space-y-1">
							<p className="text-lg font-semibold">
								No hay comprobantes por revisar
							</p>
							<p className="max-w-md text-sm text-muted-foreground">
								Cuando un cliente suba un comprobante, aparecerá aquí para que
								puedas validar el pago.
							</p>
						</div>
					</CardContent>
				</Card>
			) : (
				<>
					<div className="space-y-3 md:hidden">
						{pendingVouchers.map((order) => (
							<OrderVoucherReviewDialog key={order.id} order={order} />
						))}
					</div>

					<div className="hidden md:block">
						<DataTable
							columns={voucherColumns}
							data={pendingVouchers}
							columnTitles={voucherColumnTitles}
						/>
					</div>
				</>
			)}
		</div>
	);
}
