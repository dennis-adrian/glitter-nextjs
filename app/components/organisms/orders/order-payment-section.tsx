"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { CheckCircle2Icon, ClockIcon, XCircleIcon } from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { submitOrderPaymentVoucher } from "@/app/lib/orders/actions";
import { OrderStatus } from "@/app/lib/orders/definitions";

type Props = {
	orderId: number;
	totalAmount: number;
	status: OrderStatus;
	paymentVoucherUrl: string | null;
};

export default function OrderPaymentSection({
	orderId,
	totalAmount,
	status,
	paymentVoucherUrl: initialVoucherUrl,
}: Props) {
	const [voucherUrl, setVoucherUrl] = useState<string | null>(
		initialVoucherUrl,
	);
	const [isUploading, setIsUploading] = useState(false);

	async function handleUploadComplete(imageUrl: string) {
		const result = await submitOrderPaymentVoucher(orderId, imageUrl);
		if (result.success) {
			setVoucherUrl(imageUrl);
			toast.success("Comprobante enviado — revisaremos tu pago pronto");
		} else {
			toast.error(result.message);
		}
	}

	if (status === "cancelled") {
		return (
			<StatusCard
				icon={<XCircleIcon className="h-5 w-5 text-red-500" />}
				title="Pedido cancelado"
				description="Este pedido fue cancelado."
				color="red"
			/>
		);
	}

	if (status === "delivered") {
		return (
			<StatusCard
				icon={<CheckCircle2Icon className="h-5 w-5 text-green-600" />}
				title="Pedido entregado"
				description="Tu pedido ya fue entregado. ¡Gracias por tu compra!"
				color="green"
			/>
		);
	}

	if (status === "paid") {
		return (
			<StatusCard
				icon={<CheckCircle2Icon className="h-5 w-5 text-green-600" />}
				title="Pago confirmado"
				description="Tu pago fue verificado. Pronto coordinaremos la entrega."
				color="green"
			/>
		);
	}

	if (status === "processing" || voucherUrl) {
		return (
			<StatusCard
				icon={<ClockIcon className="h-5 w-5 text-blue-500" />}
				title="Comprobante enviado — en revisión"
				description="Recibimos tu comprobante de pago. Verificaremos y confirmaremos tu pedido a la brevedad."
				color="blue"
			>
				{voucherUrl && (
					<Image
						src={voucherUrl}
						alt="Comprobante de pago"
						width={200}
						height={260}
						className="mx-auto rounded-md border mt-4 object-cover"
					/>
				)}
			</StatusCard>
		);
	}

	// pending + no voucher — show QR + upload
	return (
		<Card>
			<CardContent className="p-6 space-y-5">
				<div className="text-center space-y-1">
					<p className="text-sm text-muted-foreground">Total a pagar</p>
					<p className="text-3xl font-bold">Bs {totalAmount.toFixed(2)}</p>
				</div>

				<div className="flex justify-center">
					<Image
						src="/img/glitter-store-qr-code.png"
						alt="QR de pago Glitter"
						width={200}
						height={200}
						className="rounded-md border"
					/>
				</div>

				<p className="text-sm text-center text-muted-foreground">
					Escaneá el QR, ingresá el monto exacto de{" "}
					<span className="font-semibold text-foreground">
						Bs {totalAmount.toFixed(2)}
					</span>{" "}
					y realizá el pago. Luego subí tu comprobante acá.
				</p>

				<PaymentProofUpload
					endpoint="storeOrderPayment"
					onUploadComplete={handleUploadComplete}
					onUploading={setIsUploading}
				/>

				{isUploading && (
					<p className="text-xs text-center text-muted-foreground">
						Subiendo comprobante...
					</p>
				)}
			</CardContent>
		</Card>
	);
}

function StatusCard({
	icon,
	title,
	description,
	color,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	color: "green" | "blue" | "red";
	children?: React.ReactNode;
}) {
	const colorClasses = {
		green: "border-green-200 bg-green-50",
		blue: "border-blue-200 bg-blue-50",
		red: "border-red-200 bg-red-50",
	};

	return (
		<Card className={`border ${colorClasses[color]}`}>
			<CardContent className="p-6 space-y-2">
				<div className="flex items-center gap-2">
					{icon}
					<h3 className="font-semibold">{title}</h3>
				</div>
				<p className="text-sm text-muted-foreground">{description}</p>
				{children}
			</CardContent>
		</Card>
	);
}
