"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, ClockIcon, XCircleIcon } from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { submitOrderPaymentVoucher } from "@/app/lib/orders/actions";
import { OrderStatus } from "@/app/lib/orders/definitions";
import Heading from "@/app/components/atoms/heading";

type Props = {
	orderId: number;
	totalAmount: number | string;
	status: OrderStatus;
	paymentVoucherUrl: string | null;
};

export default function OrderPaymentSection({
	orderId,
	totalAmount,
	status,
	paymentVoucherUrl: initialVoucherUrl,
}: Props) {
	const [voucherUrl] = useState<string | null>(initialVoucherUrl);
	const router = useRouter();

	async function handleUploadComplete(imageUrl: string) {
		try {
			const result = await submitOrderPaymentVoucher(orderId, imageUrl);
			if (result.success) {
				toast.success("Comprobante enviado. Revisaremos tu pago pronto");
				router.push("/my_orders");
			} else {
				toast.error(result.message);
			}
		} catch (error) {
			console.error(
				"[order-payment-section] handleUploadComplete / submitOrderPaymentVoucher error:",
				error,
			);
			toast.error("No se pudo enviar el comprobante. Intentá de nuevo.");
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

	// "In review" is driven only by status; voucher image is shown when available.
	if (status === "payment_verification" || status === "processing") {
		return (
			<StatusCard
				icon={<ClockIcon className="h-5 w-5 text-blue-500" />}
				title="Pago realizado — en revisión"
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

	// pending + no voucher — show QR + step-by-step upload
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
			<div className="bg-card border rounded-lg p-4">
				<div className="text-center mb-3">
					<p className="text-sm text-muted-foreground">Total a pagar</p>
					<p className="text-3xl text-primary font-bold">
						Bs {Number(totalAmount).toFixed(2)}
					</p>
				</div>

				<div className="flex justify-center">
					<Image
						src="/img/glitter-store-qr-code.png"
						alt="QR de pago Glitter"
						width={280}
						height={280}
						className="rounded-md border p-2"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-4">
				<div className="bg-primary-50 border border-primary-400 rounded-lg p-4">
					<Heading className="text-primary mb-2" level={4}>
						Instrucciones de pago
					</Heading>
					<ol className="list-decimal list-inside text-primary-900 text-sm">
						<li>Escaneá el código QR con la app de tu banco</li>
						<li>
							Ingresá el monto exacto de{" "}
							<span className="font-bold">Bs {Number(totalAmount).toFixed(2)}</span>
						</li>
						<li>Confirmá la transacción y guardá el comprobante</li>
						<li>Subí el comprobante y presioná "Confirmar pago"</li>
					</ol>
				</div>
				{/* The payment upload dropzone is hidden on mobile because there is a dedicated sticky button for smaller screens */}
				<div className="hidden md:flex flex-col gap-3 bg-card border rounded-lg p-4">
					<Heading level={4}>Comprobante de pago</Heading>
					<PaymentProofUpload
						endpoint="storeOrderPayment"
						onUploadComplete={handleUploadComplete}
						onUploading={() => {}}
					/>
				</div>
			</div>
		</div>
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
