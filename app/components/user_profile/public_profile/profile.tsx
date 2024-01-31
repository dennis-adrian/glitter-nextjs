import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FilePenLineIcon, FrownIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";

import UserRoleBadge from "@/app/components/user-role-badge";
import ProfilePicField from "@/app/components/user_profile/profile_pic/field";
import { socialsIcons, socialsUrls } from "@/app/lib/config";
import { Button } from "@/components/ui/button";
import Modal from "@/components/user_profile/modal";
import Form from "./form";

export default function PublicProfile({ profile }: { profile: ProfileType }) {
  const socials = profile.userSocials.filter((social) => social.username);
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mi Perfil</h1>
      </div>
      <div className="my-4 flex flex-col items-center gap-3">
        <ProfilePicField profile={profile} />
        <div className="relative min-w-full p-4 pt-6">
          <div className="absolute -top-4 right-0">
            <Modal profile={profile} title="Editar Perfil" FormComponent={Form}>
              <Button variant="ghost">
                <FilePenLineIcon className="mr-1 h-4 w-4" />
                Editar
              </Button>
            </Modal>
          </div>
          <div className="flex flex-col gap-1 text-center">
            {profile.displayName ? (
              <div className="text-xl font-bold">{profile.displayName}</div>
            ) : (
              <div className="text-muted-foreground text-xl">Sin nombre</div>
            )}
            <div>
              <UserRoleBadge role={profile.role} />
            </div>
            {profile.bio ? (
              <div className="text-sm">{profile.bio}</div>
            ) : (
              <div className="text-muted-foreground flex justify-center text-sm">
                No tienes bio
                <FrownIcon className="ml-2 h-4 w-4" />
              </div>
            )}
            <div className="flex items-center justify-center gap-2">
              {socials && socials.length > 0 ? (
                socials.map((social) => {
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
                })
              ) : (
                <div className="text-muted-foreground text-sm">
                  Sin redes agregadas
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
