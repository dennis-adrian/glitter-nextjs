import { Modal } from "@/app/components/atoms/modal";
import { ConfirmReservationForm } from "@/app/components/payments/forms/confirm-reservation-form";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";
import { AlertCircleIcon } from "lucide-react";

type ConfirmReservationModalProps = {
	invoice: InvoiceWithPaymentsAndStandAndProfile;
	show: boolean;
	onOpenChange: (open: boolean) => void;
};
export default function ConfirmReservationModal(props: ConfirmReservationModalProps) {
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
				<ConfirmReservationForm
					invoice={props.invoice}
					onSuccess={() => props.onOpenChange(false)}
				/>
			</div>
		</Modal>
	);
}
