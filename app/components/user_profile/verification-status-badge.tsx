import { ProfileType } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { BadgeCheckIcon, BadgeMinusIcon } from "lucide-react";

export default function VerificationStatusBadge({
  profile,
}: {
  profile: ProfileType;
}) {
  if (profile.verified) {
    return (
      <Badge variant="dark">
        <BadgeCheckIcon className="h-4 w-4 mr-1" />
        Verificado
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      <BadgeMinusIcon className="h-4 w-4 mr-1" />
      Sin verificar
    </Badge>
  );
}
