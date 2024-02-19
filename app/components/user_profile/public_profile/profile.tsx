import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FilePenLineIcon, FrownIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import ProfilePicField from "@/app/components/user_profile/profile_pic/field";
import { socialsIcons, socialsUrls } from "@/app/lib/config";
import { Button } from "@/components/ui/button";
import Modal from "@/components/user_profile/modal";
import Form from "./form";

export default function PublicProfile({
  profile,
  title = "Perfil Público",
}: {
  profile: ProfileType;
  title?: string;
}) {
  const socials = profile.userSocials.filter((social) => social.username);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Esta información será visible para todos los usuarios de la página.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <ProfilePicField profile={profile} />
            <div className="relative min-w-full pt-2">
              <div className="absolute -top-3 right-1">
                <Modal
                  profile={profile}
                  title="Editar Perfil"
                  FormComponent={Form}
                >
                  <Button variant="ghost">
                    <FilePenLineIcon className="mr-1 h-4 w-4" />
                    Editar
                  </Button>
                </Modal>
              </div>
              <div className="flex flex-col gap-1 text-center p-3">
                {profile.displayName ? (
                  <div className="text-xl md:text-2xl font-bold">
                    {profile.displayName}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-xl">
                    Sin nombre
                  </div>
                )}
                {profile.bio ? (
                  <div className="text-sm md:text-base text-muted-foreground">
                    {profile.bio}
                  </div>
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
        </CardContent>
      </Card>
    </>
  );
}
