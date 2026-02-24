"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLinkIcon } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { updateStand } from "@/app/api/stands/actions";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import ConfirmReservationModal from "@/app/components/payments/confirm-reservation-modal";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/app/components/ui/drawer";
import { Button } from "@/app/components/ui/button";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";

type AdminOverviewStandDrawerProps = {
	stand: StandWithReservationsWithParticipants | null;
	invoice: InvoiceWithParticipants | null;
	sectorName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const STAND_STATUS_OPTIONS = [
	{ value: "available", label: "Disponible" },
	{ value: "reserved", label: "Reservado" },
	{ value: "confirmed", label: "Confirmado" },
	{ value: "disabled", label: "Deshabilitado" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
	illustration: "Ilustración",
	gastronomy: "Gastronomía",
	entrepreneurship: "Emprendimiento",
	new_artist: "Artista nuevo",
	none: "Sin categoría",
};

function formatPrice(amount: number) {
	return new Intl.NumberFormat("es-BO", {
		style: "currency",
		currency: "BOB",
		minimumFractionDigits: 2,
	}).format(amount);
}

export default function AdminOverviewStandDrawer({
	stand,
	invoice,
	sectorName,
	open,
	onOpenChange,
}: AdminOverviewStandDrawerProps) {
	const router = useRouter();
	const [selectedStatus, setSelectedStatus] = useState<string>(
		stand?.status ?? "available",
	);
	const [isSavingStatus, setIsSavingStatus] = useState(false);
	const [showConfirmModal, setShowConfirmModal] = useState(false);

	useEffect(() => {
		if (stand?.status) setSelectedStatus(stand.status);
	}, [stand?.status]);

	if (!stand) return null;

	const canConfirm = invoice?.reservation.status === "verification_payment";
	const paymentVoucher = invoice?.payments?.[0]?.voucherUrl;

	const handleStatusSave = async () => {
		if (selectedStatus === stand.status) return;
		setIsSavingStatus(true);
		try {
			const res = await updateStand({
				id: stand.id,
				label: stand.label ?? "S",
				standNumber: stand.standNumber,
				status: selectedStatus as
					| "available"
					| "held"
					| "reserved"
					| "confirmed"
					| "disabled",
				price: stand.price ?? undefined,
				standCategory: stand.standCategory ?? undefined,
			});
			if (res.success) {
				toast.success("Estado actualizado");
				router.refresh();
			} else {
				toast.error(res.message);
			}
		} catch {
			toast.error("Error al actualizar el estado");
		} finally {
			setIsSavingStatus(false);
		}
	};

	return (
		<>
			<Drawer open={open} onOpenChange={onOpenChange}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>
							Espacio {stand.label}
							{stand.standNumber} — Sector {sectorName}
						</DrawerTitle>
					</DrawerHeader>

					<div className="px-4 pb-6 space-y-4 overflow-y-auto max-h-[70vh]">
						{/* Stand meta */}
						<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
							{stand.standCategory && (
								<span>
									Categoría:{" "}
									<strong className="text-foreground">
										{CATEGORY_LABELS[stand.standCategory] ??
											stand.standCategory}
									</strong>
								</span>
							)}
							{stand.price != null && (
								<span>
									Precio:{" "}
									<strong className="text-foreground">
										{formatPrice(stand.price)}
									</strong>
								</span>
							)}
						</div>

						{/* Stand status update */}
						<div className="rounded-lg border p-4 space-y-3">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">Estado del espacio</span>
								<StandStatusBadge status={stand.status} />
							</div>
							<div className="flex gap-2">
								<Select
									value={selectedStatus}
									onValueChange={setSelectedStatus}
								>
									<SelectTrigger className="flex-1">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{STAND_STATUS_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									size="sm"
									onClick={handleStatusSave}
									disabled={isSavingStatus || selectedStatus === stand.status}
								>
									{isSavingStatus ? "Guardando…" : "Guardar"}
								</Button>
							</div>
						</div>

						{/* Reservation section */}
						{invoice ? (
							<div className="rounded-lg border p-4 space-y-3">
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">Reserva</span>
									<ReservationStatus reservation={invoice.reservation} />
								</div>

								{/* Primary user */}
								<div className="space-y-2">
									<p className="text-xs text-muted-foreground">Participantes</p>
									<div className="flex items-center gap-2">
										<Avatar className="h-8 w-8">
											<AvatarImage
												src={invoice.user.imageUrl ?? undefined}
												alt={invoice.user.displayName ?? ""}
											/>
										</Avatar>
										<span className="text-sm">
											{invoice.user.displayName}{" "}
											<span className="text-muted-foreground text-xs">
												(titular)
											</span>
										</span>
									</div>
									{invoice.reservation.participants
										.filter((p) => p.user.id !== invoice.user.id)
										.map((p) => (
											<div key={p.id} className="flex items-center gap-2">
												<Avatar className="h-8 w-8">
													<AvatarImage
														src={p.user.imageUrl ?? undefined}
														alt={p.user.displayName ?? ""}
													/>
												</Avatar>
												<span className="text-sm">{p.user.displayName}</span>
											</div>
										))}
								</div>

								{/* Invoice amount */}
								<div className="flex items-center justify-between text-sm pt-2 border-t">
									<span className="text-muted-foreground">Monto</span>
									<span className="font-semibold">
										{formatPrice(invoice.amount)}
									</span>
								</div>

								{/* Payment voucher */}
								{paymentVoucher && (
									<a
										href={paymentVoucher}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
									>
										Ver comprobante de pago
										<ExternalLinkIcon className="h-3.5 w-3.5" />
									</a>
								)}

								{/* Confirm button */}
								{canConfirm && (
									<Button
										className="w-full mt-2"
										onClick={() => {
											onOpenChange(false);
											setShowConfirmModal(true);
										}}
									>
										Confirmar reserva
									</Button>
								)}
							</div>
						) : (
							<p className="text-sm text-muted-foreground text-center py-2">
								Sin reserva activa
							</p>
						)}
					</div>
				</DrawerContent>
			</Drawer>

			{invoice && showConfirmModal && (
				<ConfirmReservationModal
					invoice={invoice}
					show={showConfirmModal}
					onOpenChange={(isOpen) => {
						setShowConfirmModal(isOpen);
						if (!isOpen) {
							onOpenChange(false);
							router.refresh();
						}
					}}
				/>
			)}
		</>
	);
}
