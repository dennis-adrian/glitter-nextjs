import { FullReservation } from "@/app/api/reservations/definitions";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { DisplayPaymentStatus } from "@/app/lib/payments/helpers";
import { userCategoryOptions } from "@/app/lib/utils";
import { columns, columnTitles } from "./columns";

export default function ReservationsTable({
	data,
}: {
	data: FullReservation[];
}) {
	return (
		<DataTable
			columns={columns}
			data={data}
			columnTitles={columnTitles}
			initialState={{
				columnVisibility: {
					festivalId: false,
				},
			}}
			filters={[
				{
					label: "Estado de la reserva",
					columnId: "status",
					options: [
						{ value: "pending", label: "Pendiente" },
						{ value: "verification_payment", label: "Verificación de Pago" },
						{ value: "accepted", label: "Confirmada" },
						{ value: "rejected", label: "Rechazada" },
					],
				},
				{
					label: "Estado del pago",
					columnId: "paymentStatus",
					options: [
						{
							value: DisplayPaymentStatus.PENDING,
							label: DisplayPaymentStatus.PENDING,
						},
						{
							value: DisplayPaymentStatus.OUTSTANDING,
							label: DisplayPaymentStatus.OUTSTANDING,
						},
						{
							value: DisplayPaymentStatus.PAID,
							label: DisplayPaymentStatus.PAID,
						},
						{
							value: DisplayPaymentStatus.CANCELLED,
							label: DisplayPaymentStatus.CANCELLED,
						},
					],
				},
				{
					label: "Sector",
					columnId: "festivalSector",
					options: [...userCategoryOptions],
				},
			]}
		/>
	);
}
