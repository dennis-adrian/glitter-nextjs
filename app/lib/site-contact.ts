/**
 * How to reach Productora Glitter. The public footer shows these to visitors;
 * signed-in screens have no footer, so Más and the account menus list them.
 */
export const SITE_CONTACT_EMAIL = "info@productoraglitter.com";

export type SocialNetwork = "instagram" | "tiktok" | "facebook";

export const SOCIAL_LINKS: ReadonlyArray<{
  network: SocialNetwork;
  label: string;
  href: string;
}> = [
  {
    network: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/glitter.bo",
  },
  { network: "tiktok", label: "TikTok", href: "https://tiktok.com/@glitter.bo" },
  {
    network: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/glitterfestival",
  },
];

export function copyrightNotice(year = new Date().getFullYear()) {
  return `© ${year} Productora Glitter. Todos los derechos reservados.`;
}
