import { fetchUserProfileById } from "@/app/api/users/actions";
import { Separator } from "@/app/components/ui/separator";
import BirthdateField from "@/app/components/user_profile/birthdate/field";
import EmailField from "@/app/components/user_profile/email/field";
import NameField from "@/app/components/user_profile/name/field";
import { PersonalInformation } from "@/app/components/user_profile/personal_information";
import PhoneField from "@/app/components/user_profile/phone/field";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";

export default async function Page({ params }: { params: { id: string } }) {
  const id = params.id;
  const response = await fetchUserProfileById(parseInt(id));
  const profile = response.user;

  if (!profile) {
    return <div>Usuario no encontrado</div>;
  }

  return (
    <div className="mx-auto max-w-screen-lg p-3 md:p-6">
      <div className="flex flex-col gap-4">
        <AnnouncementCard profile={profile} />
        <PublicProfile profile={profile} title="Perfil de Usuario" />
        <PersonalInformation profile={profile} />
      </div>
    </div>
  );
}
