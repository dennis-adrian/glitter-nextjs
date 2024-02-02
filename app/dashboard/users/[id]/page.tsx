import { fetchUserProfileById } from "@/app/api/users/actions";
import { Separator } from "@/app/components/ui/separator";
import BirthdateField from "@/app/components/user_profile/birthdate/field";
import EmailField from "@/app/components/user_profile/email/field";
import NameField from "@/app/components/user_profile/name/field";
import PhoneField from "@/app/components/user_profile/phone/field";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";

export default async function Page({ params }: { params: { id: string } }) {
  const id = params.id;
  const response = await fetchUserProfileById(parseInt(id));
  const profile = response.user;

  if (!profile) {
    return <div>Usuario no encontrado</div>;
  }

  return (
    <div className="mx-auto w-full max-w-lg p-5">
      <PublicProfile profile={profile} title="Perfil de Usuario" />
      <Separator />

      <div className="my-4">
        <h1 className="text-xl font-bold">Información Personal</h1>
      </div>
      <div className="flex w-full flex-col gap-2">
        <NameField profile={profile} />
        <BirthdateField profile={profile} />
        <EmailField profile={profile} />
        <PhoneField profile={profile} />
      </div>
    </div>
  );
}
