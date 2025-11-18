import { Separator } from "@/app/components/ui/separator";
import CollaboratorForm from "@/app/components/organisms/upcoming-festival/collaborator-form";
import TeamMember from "@/app/components/organisms/upcoming-festival/team-member";
import { ReservationWithParticipantsAndUsersAndStandAndCollaborators } from "@/app/api/reservations/definitions";

type TeamTabContentProps = {
  reservation: ReservationWithParticipantsAndUsersAndStandAndCollaborators;
};

export default function TeamTabContent(props: TeamTabContentProps) {
  if (props.reservation.status !== "accepted") {
		return (
			<div className="border border-gray-200 bg-gray-50 p-4 rounded-md text-sm text-muted-foreground">
				<p>
					No puedes gestionar tu equipo hasta que tu reserva sea confirmada.
				</p>
			</div>
		);
	}

  const teamMembers = props.reservation.collaborators.map(
    (collaborator) => collaborator.collaborator,
  );

  return (
		<div className="space-y-4">
			<h3 className="font-semibold">Gestiona tu equipo</h3>
			<p className="text-sm text-gray-500 mb-4">
				Agrega a las personas que estarán trabajando en tu stand, incluyéndote.
				Podrás agregar hasta 4 personas pero solamente podrán haber 2 personas
				trabajando en el stand al mismo tiempo.{" "}
			</p>

			{teamMembers.length < 4 ? (
				<CollaboratorForm reservationId={props.reservation.id} />
			) : (
				<div className="md:text-center p-6 bg-gray-100 rounded-lg">
					<p className="text-gray-500 text-sm md:text-base">
						Llegaste al límite de 4 personas en el equipo.
					</p>
				</div>
			)}

			<Separator />

			<div>
				<h3 className="font-semibold mb-4">
					Tu Equipo ({teamMembers.length}/4)
				</h3>
				{teamMembers.length > 0 ? (
					<div className="space-y-3">
						{teamMembers.map((member) => (
							<TeamMember
								key={member.id}
								reservationId={props.reservation.id}
								member={member}
							/>
						))}
					</div>
				) : (
					<div className="text-center p-6 bg-gray-50 rounded-lg">
						<p className="text-gray-500">No hay personas en tu equipo.</p>
					</div>
				)}
			</div>
		</div>
	);
}
