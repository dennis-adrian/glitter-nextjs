import { fetchReservation } from "@/app/api/reservations/actions";
import EditReservationForm from "@/app/components/reservations/edit-form";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import ResourceNotFound from "@/app/components/resource-not-found";
import { getParticipantsOptions } from "@/app/api/reservations/helpers";
import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";
import { fetchFestival } from "@/app/lib/festivals/actions";

export default async function Page(props: { params: Promise<{ id: string }> }) {
	const params = await props.params;
	const { id } = params;
	const reservation = await fetchReservation(parseInt(id));
	if (!reservation) return <ResourceNotFound />;

	const festival = await fetchFestival({
		acceptedUsersOnly: true,
		id: reservation.festivalId,
	});
	const participants = festival!.userRequests.map((request) => request.user);
	const uniqueIds = [...new Set(participants.map((artist) => artist.id))];
	const uniqueParticipants = uniqueIds.map((id) =>
		participants.find((participant) => participant.id === id),
	);
	const options: SearchOption[] = getParticipantsOptions(
		uniqueParticipants as ProfileWithParticipationsAndRequests[],
	);

	return (
		<div className="max-w-screen-md px-4 md:px-6 m-auto">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href="/dashboard/reservations">
							Reservas
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Editar Reserva</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<h1 className="my-2 text-3xl font-bold">Editar Reserva</h1>
			<Card>
				<CardHeader>
					<CardTitle>
						Espacio{" "}
						{`${reservation?.stand.label}${reservation?.stand.standNumber}`}
					</CardTitle>
					<CardDescription>
						Puedes agregar o eliminar al acompañante de la reserva.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<EditReservationForm
						artists={
							uniqueParticipants as ProfileWithParticipationsAndRequests[]
						}
						artistsOptions={options}
						reservation={reservation}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
