import { Participant } from "@/app/api/reservations/definitions";
import CategoryBadge from "@/app/components/category-badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

type ParticipantInfoProps = {
  participant: Participant;
};

export default function ParticipantInfo(props: ParticipantInfoProps) {
  const profile = props.participant.user;

  return (
    <div className="relative p-4 border rounded-lg overflow-hidde mt-8">
      <div className="absolute top-0 left-0 w-full flex justify-center -translate-y-1/2">
        <Avatar className="w-12 h-12">
          <AvatarImage alt="avatar" src={profile.imageUrl!} />
        </Avatar>
      </div>
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <h2 className="mt-4 max-w-[100px] overflow-hidden text-ellipsis text-sm md:text-base font-semibold">
          {profile.displayName}
        </h2>
        <CategoryBadge category={profile.category} />
      </div>
    </div>
  );
}
