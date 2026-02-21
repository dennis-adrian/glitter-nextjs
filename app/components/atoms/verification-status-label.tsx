import { BaseProfile } from "@/app/api/users/definitions";
import {
	BanIcon,
	CheckCircle2Icon,
	CircleAlertIcon,
	HourglassIcon,
} from "lucide-react";

export default function VerificationStatusLabel({
	status,
}: {
	status: BaseProfile["status"];
}) {
	if (status === "banned") {
		return (
			<div className="flex items-center gap-1.5 text-sm text-red-700 mb-1">
				<BanIcon className="size-4" />
				<span>Perfil deshabilitado</span>
			</div>
		);
	}

	if (status === "rejected") {
		return (
			<div className="flex items-center gap-1.5 text-sm text-yellow-700 mb-1">
				<CircleAlertIcon className="size-4" />
				<span>Perfil rechazado</span>
			</div>
		);
	}

	if (status === "pending") {
		return (
			<div className="flex items-center gap-1.5 text-sm text-blue-700 mb-1">
				<HourglassIcon className="size-4" />
				<span>Esperando verificación</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1.5 text-sm text-violet-700 mb-1">
			<CheckCircle2Icon className="size-4" />
			<span>Perfil verificado</span>
		</div>
	);
}
