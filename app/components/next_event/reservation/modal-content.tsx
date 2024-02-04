import { Stand } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";
import ReservationForm from "@/app/components/next_event/reservation/form";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar";

export function ReservationModalContent({
  isDesktop,
  profile,
  stand,
}: {
  isDesktop: boolean;
  profile: ProfileType;
  stand: Stand;
}) {
  return (
    <div className={`${isDesktop ? "" : "px-4"}`}>
      <div className="flex justify-center">
        <Avatar>
          <AvatarImage
            src={profile.imageUrl || "/img/profile-avatar.pang"}
            alt="imagen de usuario que reserva"
          />
          <AvatarFallback>{`${profile.firstName}${profile.lastName}`}</AvatarFallback>
        </Avatar>
      </div>
      <ReservationForm stand={stand} />
    </div>
  );
}
