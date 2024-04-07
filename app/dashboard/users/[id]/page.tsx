import { fetchUserProfileById } from "@/app/api/users/actions";
import PrivateProfile from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";

export default async function Page({ params }: { params: { id: string } }) {
  const id = params.id;
  const profile = await fetchUserProfileById(parseInt(id));

  if (!profile) {
    return <div>Usuario no encontrado</div>;
  }

  return (
    <div className="mx-auto max-w-screen-lg p-3 md:p-6">
      <div className="flex flex-col gap-4">
        <AnnouncementCard profile={profile} />
        <PublicProfile profile={profile} title="Perfil de Usuario" />
        <PrivateProfile profile={profile} />
      </div>
    </div>
  );
}
