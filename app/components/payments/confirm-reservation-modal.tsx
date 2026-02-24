"use client";

import { useState } from "react";
import Image from "next/image";
import {
	TransformWrapper,
	TransformComponent,
	useControls,
} from "react-zoom-pan-pinch";
import { Modal } from "@/app/components/atoms/modal";
import { ConfirmReservationForm } from "@/app/components/payments/forms/confirm-reservation-form";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import {
	AlertCircleIcon,
	ExternalLinkIcon,
	Minus,
	Minimize2,
	Plus,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";

type ConfirmReservationModalProps = {
	invoice: InvoiceWithParticipants;
	show: boolean;
	onOpenChange: (open: boolean) => void;
};

function VoucherControls({ voucherUrl }: { voucherUrl: string }) {
	const { zoomIn, zoomOut, resetTransform } = useControls();
	return (
		<div className="absolute top-2 right-2 z-10 flex items-center gap-1">
			<Button
				variant="outline"
				size="icon"
				className="h-7 w-7 bg-background/80"
				onClick={() => zoomIn()}
				aria-label="Acercar"
			>
				<Plus className="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				className="h-7 w-7 bg-background/80"
				onClick={() => zoomOut()}
				aria-label="Alejar"
			>
				<Minus className="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				className="h-7 w-7 bg-background/80"
				onClick={() => resetTransform()}
				aria-label="Restablecer zoom"
			>
				<Minimize2 className="h-3.5 w-3.5" />
			</Button>
			<Button
				asChild
				variant="outline"
				size="icon"
				className="h-7 w-7 bg-background/80"
				aria-label="Abrir en nueva pestaña"
			>
				<a href={voucherUrl} target="_blank" rel="noopener noreferrer">
					<ExternalLinkIcon className="h-3.5 w-3.5" />
				</a>
			</Button>
		</div>
	);
}

export default function ConfirmReservationModal(
	props: ConfirmReservationModalProps,
) {
	const voucherUrl = props.invoice.payments[0]?.voucherUrl;
	const [failedVoucherUrl, setFailedVoucherUrl] = useState<string | null>(null);
	const imgError = voucherUrl != null && failedVoucherUrl === voucherUrl;

	return (
		<Modal isOpen={props.show} onClose={() => props.onOpenChange(false)}>
			<div className="flex flex-col items-center gap-3 text-center my-4">
				<AlertCircleIcon size={48} className="text-amber-500" />
				<div className="flex flex-col gap-2">
					<p>
						¿Estás seguro que deseas confirmar la reserva para el espacio{" "}
						<strong>{`${props.invoice.reservation.stand.label}${props.invoice.reservation.stand.standNumber}`}</strong>
						?
					</p>
					<p>
						El usuario que hizo la reserva recibirá una notificación por correo
						electrónico.
					</p>
				</div>
				{voucherUrl && (
					<div className="w-full text-left space-y-2">
						<p className="text-sm font-medium">Comprobante de pago</p>
						{!imgError ? (
							<div className="relative w-full overflow-hidden rounded-lg border">
								<TransformWrapper
									minScale={1}
									maxScale={4}
									wheel={{ disabled: true }}
								>
									<VoucherControls voucherUrl={voucherUrl} />
									<TransformComponent
										wrapperStyle={{ width: "100%" }}
										contentStyle={{ width: "100%" }}
									>
										<div className="relative w-full h-64">
											<Image
												src={voucherUrl}
												alt="Comprobante de pago"
												fill
												sizes="(max-width: 640px) 100vw, 500px"
												className="object-contain"
												onError={() => setFailedVoucherUrl(voucherUrl)}
											/>
										</div>
									</TransformComponent>
								</TransformWrapper>
							</div>
						) : (
							<a
								href={voucherUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
							>
								Ver comprobante de pago
								<ExternalLinkIcon className="h-3.5 w-3.5" />
							</a>
						)}
					</div>
				)}
				<ConfirmReservationForm
					invoice={props.invoice}
					onSuccess={() => props.onOpenChange(false)}
				/>
			</div>
		</Modal>
	);
}
