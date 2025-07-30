import { ParticipantProduct } from "@/app/lib/participant_products/definitions";
import { AlertCircleIcon, CheckCircleIcon, ClockIcon } from "lucide-react";

export const getStatusIcon = (status: string) => {
	switch (status) {
		case "approved":
			return <CheckCircleIcon className="w-4 h-4 text-green-800" />;
		case "rejected":
			return <AlertCircleIcon className="w-4 h-4 text-red-800" />;
		default:
			return <ClockIcon className="w-4 h-4 text-amber-800" />;
	}
};

export const getStatusColor = (status: string) => {
	switch (status) {
		case "approved":
			return "bg-green-50 text-green-800 border border-green-200";
		case "rejected":
			return "bg-red-50 text-red-800 border border-red-200";
		default:
			return "bg-amber-50 text-amber-800 border border-amber-200";
	}
};

export const getStatusText = (
	status: ParticipantProduct["submissionStatus"],
) => {
	switch (status) {
		case "approved":
			return "Aprobado";
		case "rejected":
			return "Rechazado";
		default:
			return "En revisión";
	}
};
