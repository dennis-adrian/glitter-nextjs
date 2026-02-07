import { ProfileType } from "@/app/api/users/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { profileHasReservationMade } from "@/app/helpers/next_event";
import { fetchInvoicesByReservation } from "@/app/data/invoices/actions";
import { isProfileComplete, getMissingProfileFields } from "@/app/lib/utils";
import { FullFestival } from "@/app/lib/festivals/definitions";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { Progress } from "@/app/components/ui/progress";
import {
	ArrowRightIcon,
	CheckCircle2Icon,
	CircleAlertIcon,
	ExternalLinkIcon,
	ImageIcon,
	ListTodoIcon,
	UserIcon,
	VoteIcon,
	WalletIcon,
} from "lucide-react";

type TasksSectionProps = {
	profile: ProfileType;
	festival: FullFestival | null | undefined;
};

type Task = {
	id: string;
	icon: React.ReactNode;
	title: string;
	description?: string;
	href: string;
	linkLabel: string;
	priority: number;
};

const TOTAL_PROFILE_FIELDS = 12; // bio, imageUrl, firstName, lastName, birthdate, phoneNumber, displayName, email, gender, country, category, subcategories + socials

export default async function TasksSection({
	profile,
	festival,
}: TasksSectionProps) {
	const tasks: Task[] = [];

	// Task 1: Complete profile
	if (!isProfileComplete(profile)) {
		const missingFields = getMissingProfileFields(profile);
		const completedFields = TOTAL_PROFILE_FIELDS - missingFields.length;
		const completionPercentage = Math.round(
			(completedFields / TOTAL_PROFILE_FIELDS) * 100,
		);

		tasks.push({
			id: "complete-profile",
			icon: <UserIcon className="w-5 h-5 text-amber-500" />,
			title: "Completá tu perfil",
			description: `${completionPercentage}% completado - Faltan ${missingFields.length} campos`,
			href: "/my_profile",
			linkLabel: "Ir a mi perfil",
			priority: 1,
		});
	}

	// Task 2: Pending payments (only if user has a reservation in active festival)
	if (festival) {
		const hasReservation = profileHasReservationMade(profile, festival.id);
		if (hasReservation) {
			const participation = profile.participations.find(
				(p) =>
					p.reservation.festivalId === festival.id &&
					p.reservation.status !== "rejected",
			);

			if (participation) {
				try {
					const invoices = await fetchInvoicesByReservation(
						participation.reservation.id,
					);
					const hasPendingPayment = invoices.some(
						(invoice) => invoice.status === "pending",
					);

					if (hasPendingPayment) {
						tasks.push({
							id: "pending-payment",
							icon: <WalletIcon className="w-5 h-5 text-amber-500" />,
							title: "Tenés un pago pendiente",
							description:
								"Completá tu pago para confirmar tu reserva",
							href: `/profiles/${profile.id}/festivals/${festival.id}/reservations/${participation.reservation.id}/payments`,
							linkLabel: "Ir a pagos",
							priority: 2,
						});
					}
				} catch {
					// Silently fail
				}
			}
		}
	}

	// Task 3: Submit products
	if (profile.shouldSubmitProducts && festival) {
		const isInFestival = isProfileInFestival(festival.id, profile);
		if (isInFestival) {
			tasks.push({
				id: "submit-products",
				icon: <ImageIcon className="w-5 h-5 text-amber-500" />,
				title: "Subí imágenes de tus productos",
				description:
					"Mostrá lo que ofrecerás en el festival subiendo imágenes",
				href: "/my_participations/submit_products",
				linkLabel: "Subir imágenes",
				priority: 3,
			});
		}
	}

	// Task 4: Voting opportunities
	if (festival) {
		const bestStandActivity = festival.festivalActivities?.find(
			(activity) => activity.type === "best_stand",
		);
		const festivalStickerActivity = festival.festivalActivities?.find(
			(activity) => activity.type === "festival_sticker",
		);

		const isInFestival = isProfileInFestival(festival.id, profile);
		if (isInFestival) {
			if (bestStandActivity) {
				tasks.push({
					id: "vote-best-stand",
					icon: <VoteIcon className="w-5 h-5 text-primary" />,
					title: "Votá por tu stand favorito",
					description: "Participá en la actividad de Iconic Stand",
					href: `/profiles/${profile.id}/festivals/${festival.id}/activity/${bestStandActivity.id}/voting`,
					linkLabel: "Ir a la votación",
					priority: 4,
				});
			}

			if (festivalStickerActivity) {
				tasks.push({
					id: "vote-sticker",
					icon: <VoteIcon className="w-5 h-5 text-primary" />,
					title: "Votá por tu Sticker Navideño favorito",
					description:
						"Elegí tu sticker favorito en la actividad del festival",
					href: `/profiles/${profile.id}/festivals/${festival.id}/activity/${festivalStickerActivity.id}/voting`,
					linkLabel: "Ir a la votación",
					priority: 5,
				});
			}
		}
	}

	// Sort by priority
	tasks.sort((a, b) => a.priority - b.priority);

	const profileCompletionTask = tasks.find(
		(t) => t.id === "complete-profile",
	);
	const missingFields = !isProfileComplete(profile)
		? getMissingProfileFields(profile)
		: [];
	const completedFields = TOTAL_PROFILE_FIELDS - missingFields.length;
	const completionPercentage = Math.round(
		(completedFields / TOTAL_PROFILE_FIELDS) * 100,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg flex items-center gap-2">
					<ListTodoIcon className="w-5 h-5" />
					Tareas pendientes
				</CardTitle>
			</CardHeader>
			<CardContent>
				{tasks.length === 0 ? (
					<div className="flex items-center gap-3 p-3 text-muted-foreground">
						<CheckCircle2Icon className="w-6 h-6 text-green-500" />
						<span className="text-sm">
							No tenés tareas pendientes. ¡Todo al día!
						</span>
					</div>
				) : (
					<div className="space-y-3">
						{tasks.map((task) => (
							<div
								key={task.id}
								className="flex items-start gap-3 p-3 bg-muted/50 rounded-md"
							>
								<div className="shrink-0 mt-0.5">{task.icon}</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium">
										{task.title}
									</p>
									{task.id === "complete-profile" ? (
										<div className="mt-2">
											<Progress
												value={completionPercentage}
												className="h-2"
											/>
											<p className="text-xs text-muted-foreground mt-1">
												{completionPercentage}% completado
											</p>
										</div>
									) : (
										task.description && (
											<p className="text-xs text-muted-foreground mt-0.5">
												{task.description}
											</p>
										)
									)}
									<RedirectButton
										href={task.href}
										variant="link"
										size="sm"
										className="p-0 h-auto mt-1 text-xs"
									>
										{task.linkLabel}
										<ArrowRightIcon className="ml-1 w-3 h-3" />
									</RedirectButton>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
