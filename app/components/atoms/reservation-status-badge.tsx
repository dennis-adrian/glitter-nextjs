import { ReservationBase } from "@/app/api/reservations/definitions";
import { Badge } from "@/app/components/ui/badge";

const statusColors = {
	pending: "bg-gray-500 hover:bg-gray-400",
	accepted: "bg-green-500 hover:bg-green-400",
	verification_payment: "bg-blue-500 hover:bg-blue-400",
	rejected: "bg-red-600 hover:bg-red-500",
};

const statusLabels = {
	pending: "Pendiente",
	accepted: "Confirmada",
	verification_payment: "Verificación de Pago",
	rejected: "Rechazada",
};

export default function ReservationStatusBadge({
	status,
}: {
	status: ReservationBase["status"];
}) {
	return (
		<Badge className={`${statusColors[status]} font-normal`}>
			{statusLabels[status]}
		</Badge>
	);
}
