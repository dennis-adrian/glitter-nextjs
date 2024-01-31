import { loadEnvConfig } from "@next/env";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

export const socials = [
  {
    name: "instagram",
    url: "https://www.instagram.com/",
  },
  {
    name: "tiktok",
    url: "https://www.tiktok.com/",
  },
  {
    name: "facebook",
    url: "https://www.facebook.com/",
  },
  {
    name: "twitter",
    url: "https://www.twitter.com/",
  },
  {
    name: "youtube",
    url: "https://www.youtube.com/",
  },
];
