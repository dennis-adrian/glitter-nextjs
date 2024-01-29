import { fetchUserProfile, UserProfileType } from '@/app/api/users/actions';
import { Separator } from '@/app/components/ui/separator';
import UserRoleBadge from '@/app/components/user-role-badge';
import BirthdateField from '@/app/components/user_profile/birthdate.tsx/field';
import EmailField from '@/app/components/user_profile/email/field';
import NameField from '@/app/components/user_profile/name/field';
import { Button } from '@/components/ui/button';
import { currentUser, SignedIn } from '@clerk/nextjs';
import {
  faFacebook,
  faInstagram,
  faTiktok,
} from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { FilePenLineIcon } from 'lucide-react';
import Image from 'next/image';

async function UserProfile() {
  const user = await currentUser();
  let profile: UserProfileType | null = null;
  if (user) {
    const data = await fetchUserProfile(user);
    profile = data.user!;
  }

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-lg p-5">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Mi Perfil</h1>
        <Button variant="ghost">
          <FilePenLineIcon className="w-4 h-4 mr-1" />
          Editar
        </Button>
      </div>
      <SignedIn>
        <div className="flex gap-3 flex-col items-center my-4">
          <div className="w-32 h-32 rounded-full bg-gray-200 mr-4">
            <Image
              src={profile.imageUrl || `img/profile-avatar.png`}
              alt="Imagen de perfil"
              width={136}
              height={136}
              className="rounded-full"
            />
          </div>
          <div className="flex flex-col text-center gap-1">
            <div className="text-xl font-bold">{profile.displayName}</div>
            <div>
              <UserRoleBadge role={profile.role} />
            </div>
            <div className="text-sm text-muted-foreground">{profile.bio}</div>
          </div>
          <div className="flex gap-2">
            <FontAwesomeIcon className="w-5 h-5" icon={faInstagram} />
            <FontAwesomeIcon className="w-5 h-5" icon={faFacebook} />
            <FontAwesomeIcon className="w-5 h-5" icon={faTiktok} />
          </div>
        </div>

        <Separator />

        <div className="my-4">
          <h1 className="text-xl font-bold">Información Personal</h1>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <NameField profile={profile} />
          <BirthdateField profile={profile} />
          <EmailField profile={profile} />
          {/* <UserProfileField
            label="Fecha de nacimiento"
            value={profile.birthdate?.toDateString()}
          />
          <UserProfileField
            editable={false}
            label="Correo electrónico"
            value={profile.email}
          />
          <UserProfileField label="Teléfono" value={profile.phoneNumber} /> */}
        </div>
      </SignedIn>
    </div>
  );
}

export default UserProfile;
