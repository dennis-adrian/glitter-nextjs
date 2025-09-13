import { ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments } from "@/app/api/reservations/definitions";
import { Badge } from "@/app/components/ui/badge";
import { mapPaymentStatusToDisplayPaymentStatus } from "@/app/lib/payments/helpers";

export default function PaymentStatus({
	reservation,
}: {
	reservation: ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments;
}) {
	const invoice = reservation.invoices[0];
	if (!invoice) return "--";

	const status = mapPaymentStatusToDisplayPaymentStatus(invoice, reservation);
	const statusColors: Record<typeof status, string> = {
		Pendiente: "bg-gray-500 hover:bg-gray-400",
		Pagado: "bg-green-500 hover:bg-green-400",
		Atrasado: "bg-red-600 hover:bg-red-500",
		Cancelado: "bg-gray-500 hover:bg-gray-400",
		"--": "bg-gray-500 hover:bg-gray-400",
	};

	return <Badge className={`${statusColors[status]}`}>{status}</Badge>;
}
