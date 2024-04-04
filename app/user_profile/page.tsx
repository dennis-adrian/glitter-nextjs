import { currentUser, SignedIn } from "@clerk/nextjs";

import { fetchUserProfile } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";

import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import PublicProfile from "@/components/user_profile/public_profile/profile";
import { PersonalInformation } from "@/app/components/user_profile/personal_information";

async function UserProfile() {
  const user = await currentUser();
  let profile: ProfileType | null | undefined;
  if (user) {
    profile = await fetchUserProfile(user.id);
  }

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-screen-lg p-3 md:p-6">
      <SignedIn>
        <div className="flex flex-col gap-4">
          <AnnouncementCard profile={profile} />
          <PublicProfile profile={profile} />
          <PersonalInformation profile={profile} />
        </div>
      </SignedIn>
    </div>
  );
}

export default UserProfile;
