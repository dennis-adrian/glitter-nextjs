import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UserSocial } from "@/api/users/definitions";

import {
  faFacebook,
  faInstagram,
  faTiktok,
  faTwitter,
  faYoutube,
} from "@fortawesome/free-brands-svg-icons";

// TODO: Remove this once the import from /lib/config give no errors
export const socialsUrls = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/",
  facebook: "https://www.facebook.com/",
  twitter: "https://www.twitter.com/",
  youtube: "https://www.youtube.com/",
};

export const socialsIcons = {
  instagram: faInstagram,
  tiktok: faTiktok,
  facebook: faFacebook,
  twitter: faTwitter,
  youtube: faYoutube,
};

export default function SocialsCell({ socials }: { socials: UserSocial[] }) {
  if (socials?.length === 0) return "--";
  const filteredSocials = socials.filter((social) => social.username);

  return (
    <div className="flex flex-col justify-center gap-1">
      {filteredSocials.map((social) => {
        const url = socialsUrls[social.type];
        const icon = socialsIcons[social.type];
        return (
          <a
            className="hover:underline"
            key={social.id}
            href={`${url}/${social.username}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="flex items-center">
              <FontAwesomeIcon className="mr-1 h-4 w-4" icon={icon} />
              {social.username}
            </span>
          </a>
        );
      })}
    </div>
  );
}
