import { loadEnvConfig } from "@next/env";

import {
  faFacebook,
  faInstagram,
  faTiktok,
  faTwitter,
  faYoutube,
} from "@fortawesome/free-brands-svg-icons";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

export const socialsUrls = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/@",
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
