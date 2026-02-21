import { BanIcon, CircleAlertIcon, CogIcon, HourglassIcon } from "lucide-react";
import Link from "next/link";

import { ProfileType } from "@/app/api/users/definitions";
import VerificationStatusLabel from "@/app/components/atoms/verification-status-label";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Separator } from "@/app/components/ui/separator";

type RestrictedStatus = "pending" | "rejected" | "banned";

type Props = {
	profile: ProfileType;
	status: RestrictedStatus;
};

const STATUS_CONFIG: Record<
	RestrictedStatus,
	{
		icon: React.ElementType;
		iconClass: string;
		cardClass: string;
		title: string;
		description: string;
		ctaLabel?: string;
	}
> = {
	pending: {
		icon: HourglassIcon,
		iconClass: "text-blue-600",
		cardClass: "border-blue-200 bg-blue-50/40",
		title: "Tu perfil está en revisión",
		description:
			"Nuestro equipo está verificando tu información. Mientras tanto, podés actualizar tu perfil para asegurarte de que esté completo antes de que finalice la revisión.",
		ctaLabel: "Revisar mi perfil",
	},
	rejected: {
		icon: CircleAlertIcon,
		iconClass: "text-yellow-600",
		cardClass: "border-yellow-200 bg-yellow-50/40",
		title: "Tu perfil fue rechazado",
		description:
			"Encontramos algunos problemas con tu perfil que impiden verificarlo. Actualizá tu información y volvé a solicitar la verificación.",
		ctaLabel: "Actualizar mi perfil",
	},
	banned: {
		icon: BanIcon,
		iconClass: "text-red-600",
		cardClass: "border-red-200 bg-red-50/40",
		title: "Tu perfil fue deshabilitado",
		description:
			"Tu cuenta ha sido deshabilitada. Si creés que esto es un error, contactate con nuestro equipo de soporte en soporte@productoraglitter.com.",
	},
};

export default function RestrictedDashboard({ profile, status }: Props) {
	const { icon: StatusIcon, iconClass, cardClass, title, description, ctaLabel } =
		STATUS_CONFIG[status];
	const isBanned = status === "banned";

	return (
		<div className="container p-3 md:p-6">
			<div>
				<div className="flex items-start justify-between">
					<div>
						<VerificationStatusLabel status={status} />
						<h1 className="font-bold tracking-tight text-3xl md:text-5xl">
							Hola,{" "}
							{profile.firstName ?? profile.displayName ?? "artista"}
						</h1>
					</div>
					{!isBanned && (
						<Button
							variant="outline"
							size="sm"
							className="flex shrink-0"
							asChild
						>
							<Link href="/my_profile">
								<CogIcon className="size-4 mr-1" />
								Editar perfil
							</Link>
						</Button>
					)}
				</div>
				<Separator className="mt-4" />
			</div>

			<div className="mt-6 max-w-lg">
				<Card className={cardClass}>
					<CardContent className="p-5 flex flex-col gap-4">
						<div className="flex items-start gap-3">
							<div className="mt-0.5 w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border">
								<StatusIcon className={`w-4 h-4 ${iconClass}`} />
							</div>
							<div className="flex flex-col gap-1">
								<p className="font-semibold text-sm leading-snug">{title}</p>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{description}
								</p>
							</div>
						</div>
						{ctaLabel && (
							<Button asChild className="w-full">
								<Link href="/my_profile">{ctaLabel}</Link>
							</Button>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
