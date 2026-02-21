import { AlertCircleIcon, ArrowRightIcon, CheckCircle2Icon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Participation, ProfileType } from "@/app/api/users/definitions";
import { FestivalActivity, FestivalWithDates } from "@/app/lib/festivals/definitions";

type Task = {
	id: string;
	title: string;
	description: string;
	href: string;
	urgent?: boolean;
};

type Props = {
	profile: ProfileType;
	activeFestival: FestivalWithDates | null;
	activeParticipation: Participation | null | undefined;
	festivalActivities: FestivalActivity[];
};

function buildTasks(
	profile: ProfileType,
	activeFestival: FestivalWithDates | null,
	activeParticipation: Participation | null | undefined,
	festivalActivities: FestivalActivity[],
): Task[] {
	const tasks: Task[] = [];
	const now = new Date();

	// Payment upload
	if (activeParticipation?.reservation.status === "verification_payment") {
		tasks.push({
			id: "payment",
			title: "Subir comprobante de pago",
			description:
				"Tu reserva está esperando la verificación del pago.",
			href: activeFestival
				? `/profiles/${profile.id}/festivals/${activeFestival.id}/reservations`
				: "/my_participations",
			urgent: true,
		});
	}

	// Profile status
	if (profile.status === "pending") {
		tasks.push({
			id: "profile-pending",
			title: "Perfil en revisión",
			description:
				"Tu perfil está siendo revisado. Asegúrate de que esté completo.",
			href: "/my_profile",
		});
	}

	// Festival activity tasks
	for (const activity of festivalActivities) {
		// Voting window open
		if (
			activity.allowsVoting &&
			activity.votingStartDate &&
			activity.votingEndDate
		) {
			const votingStart = new Date(activity.votingStartDate);
			const votingEnd = new Date(activity.votingEndDate);
			if (now >= votingStart && now <= votingEnd && activeFestival) {
				tasks.push({
					id: `vote-${activity.id}`,
					title: "Votar por el mejor stand",
					description: `La votación de "${activity.name}" está abierta.`,
					href: `/profiles/${profile.id}/festivals/${activeFestival.id}/activity/${activity.id}/voting`,
				});
			}
		}

		// Proof upload window open
		if (activity.requiresProof && activity.proofUploadLimitDate) {
			const deadline = new Date(activity.proofUploadLimitDate);
			if (now <= deadline) {
				tasks.push({
					id: `proof-${activity.id}`,
					title: "Subir fotos de tus productos",
					description: `Plazo: ${deadline.toLocaleDateString("es", { day: "numeric", month: "long" })}`,
					href: "/my_participations/submit_products",
				});
			}
		}
	}

	return tasks;
}

export default function PendingTasksList({
	profile,
	activeFestival,
	activeParticipation,
	festivalActivities,
}: Props) {
	const tasks = buildTasks(
		profile,
		activeFestival,
		activeParticipation,
		festivalActivities,
	);

	return (
		<Card>
			<CardHeader className="pb-3 pt-5 px-5 md:px-6">
				<CardTitle className="font-space-grotesk font-bold tracking-wide text-lg">
					Pendientes
				</CardTitle>
			</CardHeader>
			<CardContent className="px-5 md:px-6 pb-5">
				{tasks.length === 0 ? (
					<div className="flex flex-col items-center text-center gap-2 py-4">
						<div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center">
							<CheckCircle2Icon className="w-5 h-5 text-green-600" />
						</div>
						<p className="text-sm font-medium">¡Estás al día!</p>
						<p className="text-xs text-muted-foreground">
							No tienes tareas pendientes.
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-4">
						{tasks.map((task) => (
							<li key={task.id} className="flex items-start gap-3">
								<div
									className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
										task.urgent ? "bg-red-100" : "bg-amber-100"
									}`}
								>
									<AlertCircleIcon
										className={`w-4 h-4 ${
											task.urgent ? "text-red-600" : "text-amber-600"
										}`}
									/>
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium leading-snug">
										{task.title}
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{task.description}
									</p>
									<Button
										asChild
										variant="link"
										size="sm"
										className="px-0 h-auto mt-1 text-xs text-primary"
									>
										<Link href={task.href}>
											Ir ahora{" "}
											<ArrowRightIcon className="w-3 h-3 ml-1" />
										</Link>
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
