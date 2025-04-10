import { Label } from "@/app/components/ui/label";

import { Input } from "@/app/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar-radix";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Separator } from "@/app/components/ui/separator";
import CollaboratorForm from "@/app/components/organisms/upcoming-festival/collaborator-form";

export default function TeamTabContent() {
  const [teamMembers, setTeamMembers] = useState([
    {
      id: 1,
      name: "Alex Rivera",
      role: "Assistant",
      email: "alex@example.com",
      avatar: "/placeholder.svg?height=40&width=40",
    },
  ]);

  const [newMember, setNewMember] = useState({ name: "", role: "", email: "" });
  const handleAddMember = () => {
    if (newMember.name && newMember.role && newMember.email) {
      setTeamMembers([
        ...teamMembers,
        {
          id: Date.now(),
          ...newMember,
          avatar: "/placeholder.svg?height=40&width=40",
        },
      ]);
      setNewMember({ name: "", role: "", email: "" });
      toast.success("Team member added", {
        description: `${newMember.name} has been added to your stand team.`,
      });
    }
  };

  const handleRemoveMember = (id: number) => {
    setTeamMembers(teamMembers.filter((member) => member.id !== id));
    toast.success("Team member removed", {
      description: "The team member has been removed from your stand team.",
    });
  };
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Gestiona tu equipo</h3>
      <p className="text-sm text-gray-500 mb-4">
        Agrega a las personas que estarán trabajando en tu stand, incluyéndo.
        Podrás agregar hasta 4 personas pero solamente podrán haber 2 personas
        trabajando en el stand al mismo tiempo.{" "}
      </p>

      <CollaboratorForm />

      <Separator />

      <div>
        <h3 className="font-semibold mb-4">Tu Equipo ({teamMembers.length})</h3>
        {teamMembers.length > 0 ? (
          <div className="space-y-3">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={member.avatar} alt={member.name} />
                    <AvatarFallback>
                      {member.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-gray-500">
                      {member.role} • {member.email}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:text-rose-500"
                  onClick={() => handleRemoveMember(member.id)}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
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
