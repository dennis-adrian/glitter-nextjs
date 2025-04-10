import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar-radix";
import { Button } from "@/app/components/ui/button";
import { Collaborator } from "@/app/lib/reservations/definitions";
import { Trash2Icon } from "lucide-react";

type TeamMemberProps = {
  member: Collaborator;
};
export default function TeamMember({ member }: TeamMemberProps) {
  const memberName = [member.firstName, member.lastName]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>
            {memberName
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{memberName}</p>
          <p className="text-sm text-gray-500">{member.identificationNumber}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-gray-500 hover:text-rose-500"
        // onClick={() => handleRemoveMember(member.id)}
      >
        <Trash2Icon className="h-4 w-4" />
      </Button>
    </div>
  );
}
