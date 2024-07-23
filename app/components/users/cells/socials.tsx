import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UserSocial } from "@/api/users/definitions";
import { socialsIcons, socialsUrls } from "@/app/lib/users/utils";

export default function SocialsCell({ socials }: { socials: UserSocial[] }) {
  const filteredSocials = socials.filter((social) => social.username);
  if (filteredSocials?.length === 0) return "--";

  return (
    <div className="flex flex-col justify-center gap-1">
      {filteredSocials.map((social) => {
        const url = socialsUrls[social.type];
        const icon = socialsIcons[social.type];
        return (
          <a
            className="hover:underline"
            key={social.id}
            href={`${url}${social.username}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="flex items-center">
              <FontAwesomeIcon className="mr-1 h-4 w-4" icon={icon} />
              <span className="text-blue-500">{social.username}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}
