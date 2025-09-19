import RemoveCollaboratorForm from "@/app/components/organisms/upcoming-festival/remove-collaborator-form";
import { Avatar, AvatarFallback } from "@/app/components/ui/avatar-radix";
import { Collaborator } from "@/app/lib/reservations/definitions";

type TeamMemberProps = {
  reservationId: number;
  member: Collaborator;
};
export default function TeamMember({ reservationId, member }: TeamMemberProps) {
  const memberName = [member.firstName, member.lastName]
    .filter(Boolean)
    .join(" ");
  const memberInitials = member.firstName.charAt(0) + member.lastName.charAt(0);

  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{memberInitials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{memberName}</p>
            <p className="text-sm text-gray-500">
              {member.identificationNumber}
            </p>
          </div>
        </div>
        <RemoveCollaboratorForm
          reservationId={reservationId}
          collaboratorId={member.id}
        />
      </div>
    </div>
  );
}
