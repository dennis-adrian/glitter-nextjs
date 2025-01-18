import Image from "next/image";

import { fetchUserProfileById } from "@/app/api/users/actions";
import SocialMediaBadge from "@/app/components/social-media-badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import ProfileCategoryBadge from "@/app/components/user_profile/category-badge";
import { Suspense } from "react";
import FullProfile from "@/app/public_profiles/[id]/full_profile";
import { Skeleton } from "@/app/components/ui/skeleton";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const profile = await fetchUserProfileById(parseInt(params.id));

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center text-2xl font-semibold">
        El perfil no existe
      </div>
    );
  }
  return (
    <div className="container h-full p-4 md:p-6">
      <Suspense fallback={<Skeleton className="h-11" />}>
        <FullProfile profileId={profile.id} />
      </Suspense>
      <Image
        className="h-[120px] lg:h-[200px] w-full rounded-lg bg-gray-100"
        src="/img/profile-default-banner.png"
        alt="Banner de usuario"
        width={1024}
        height={300}
      />
      <div className="flex flex-col -translate-y-16 items-center gap-2">
        <Avatar className="w-28 h-28">
          <AvatarImage
            alt="avatar"
            src={profile.imageUrl || "/img/profile-avatar.png"}
          />
        </Avatar>
        <div className="flex flex-col items-center text-center gap-2">
          <h1 className="font-bold text-xl md:text-3xl">
            {profile.displayName}
          </h1>
          <ProfileCategoryBadge profile={profile} />
          <div className="text-sm md:text-base max-w-screen-md text-muted-foreground">
            {profile.bio}
          </div>
          <div className="space-x-1">
            {profile.userSocials
              .filter((social) => social.username)
              .map((social) => (
                <SocialMediaBadge
                  key={social.id}
                  socialMediaType={social.type}
                  username={social.username}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
