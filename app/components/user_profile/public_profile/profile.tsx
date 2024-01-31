import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FilePenLineIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";

import UserRoleBadge from "@/app/components/user-role-badge";
import ProfilePicField from "@/app/components/user_profile/profile_pic/field";
import { socialsIcons, socialsUrls } from "@/app/lib/config";
import { Button } from "@/components/ui/button";
import Modal from "@/components/user_profile/modal";
import Form from "./form";

export default function PublicProfile({ profile }: { profile: ProfileType }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mi Perfil</h1>
        <Modal profile={profile} title="Editar Perfil" FormComponent={Form}>
          <Button variant="ghost">
            <FilePenLineIcon className="mr-1 h-4 w-4" />
            Editar
          </Button>
        </Modal>
      </div>
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
          {profile.userSocials
            .filter((social) => social.username)
            .map((social) => {
              const url = socialsUrls[social.type];
              const icon = socialsIcons[social.type];
              return (
                <a
                  key={social.id}
                  href={`${url}/${social.username}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FontAwesomeIcon className="h-5 w-5" icon={icon} />
                </a>
              );
            })}
        </div>
      </div>
    </>
  );
}
