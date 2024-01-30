import { currentUser, SignedIn } from "@clerk/nextjs";

import {
  faFacebook,
  faInstagram,
  faTiktok,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FilePenLineIcon } from "lucide-react";

import {
  fetchUserProfile,
  UserProfileType,
  UserProfileWithParticipationRequests,
} from "@/app/api/users/actions";

import { Separator } from "@/app/components/ui/separator";
import UserRoleBadge from "@/app/components/user-role-badge";
import BirthdateField from "@/app/components/user_profile/birthdate/field";
import EmailField from "@/app/components/user_profile/email/field";
import NameField from "@/app/components/user_profile/name/field";
import PhoneField from "@/app/components/user_profile/phone/field";
import ProfilePicField from "@/app/components/user_profile/profile_pic/field";
import { Button } from "@/components/ui/button";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";

async function UserProfile() {
  const user = await currentUser();
  let profile: UserProfileWithParticipationRequests | null = null;
  if (user) {
    const data = await fetchUserProfile(user.id);
    profile = data.user!;
  }

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-lg p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mi Perfil</h1>
        <Button disabled variant="ghost">
          <FilePenLineIcon className="mr-1 h-4 w-4" />
          Editar
        </Button>
      </div>
      <SignedIn>
        <div className="my-4 flex flex-col items-center gap-3">
          <ProfilePicField profile={profile} />
          <div className="flex flex-col gap-1 text-center">
            <div className="text-xl font-bold">{profile.displayName}</div>
            <div>
              <UserRoleBadge role={profile.role} />
            </div>
            <div className="text-muted-foreground text-sm">{profile.bio}</div>
          </div>
          <div className="flex gap-2">
            <FontAwesomeIcon className="h-5 w-5" icon={faInstagram} />
            <FontAwesomeIcon className="h-5 w-5" icon={faFacebook} />
            <FontAwesomeIcon className="h-5 w-5" icon={faTiktok} />
          </div>
        </div>

        <AnnouncementCard profile={profile} />

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
      </SignedIn>
    </div>
  );
}

export default UserProfile;
