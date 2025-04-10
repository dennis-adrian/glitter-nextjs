import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar-radix";
import { Trash2Icon } from "lucide-react";
import { Separator } from "@/app/components/ui/separator";
import CollaboratorForm from "@/app/components/organisms/upcoming-festival/collaborator-form";
import TeamMember from "@/app/components/organisms/upcoming-festival/team-member";
import { ReservationWithParticipantsAndUsersAndStandAndCollaborators } from "@/app/api/reservations/definitions";

type TeamTabContentProps = {
  reservation: ReservationWithParticipantsAndUsersAndStandAndCollaborators;
};

export default function TeamTabContent(props: TeamTabContentProps) {
  const teamMembers = props.reservation.collaborators.map(
    (collaborator) => collaborator.collaborator,
  );

  // const handleRemoveMember = (id: number) => {
  //   setTeamMembers(teamMembers.filter((member) => member.id !== id));
  //   toast.success("Team member removed", {
  //     description: "The team member has been removed from your stand team.",
  //   });
  // };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Gestiona tu equipo</h3>
      <p className="text-sm text-gray-500 mb-4">
        Agrega a las personas que estarán trabajando en tu stand, incluyéndote.
        Podrás agregar hasta 4 personas pero solamente podrán haber 2 personas
        trabajando en el stand al mismo tiempo.{" "}
      </p>

      <CollaboratorForm reservationId={props.reservation.id} />

      <Separator />

      <div>
        <h3 className="font-semibold mb-4">Tu Equipo ({teamMembers.length})</h3>
        {teamMembers.length > 0 ? (
          <div className="space-y-3">
            {teamMembers.map((member) => (
              <TeamMember key={member.id} member={member} />
            ))}
          </div>
        ) : (
          <div className="text-center p-6 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No hay colaboradores en tu equipo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
