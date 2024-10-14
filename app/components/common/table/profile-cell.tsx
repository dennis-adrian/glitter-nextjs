import { BaseProfile } from "@/app/api/users/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";

export default function ProfileCell({ profile }: { profile: BaseProfile }) {
  return (
    <div className="flex gap-2 items-center" key={profile.id}>
      <Avatar className="w-8 h-8">
        <AvatarImage
          src={profile.imageUrl || "/img/profile-avatar.png"}
          alt={
            profile.displayName
              ? `Imagen de perfil de ${profile.displayName}`
              : "Imagen de perfil"
          }
        />
      </Avatar>
      <span>{profile.displayName}</span>
    </div>
  );
}
