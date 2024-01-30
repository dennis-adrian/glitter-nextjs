import { pool, db } from "@/db";
import { socials, usersToSocials } from "@/db/schema";

import { ProfileType } from "@/api/users/definitions";

type Social = typeof socials.$inferSelect;

export async function fetchAllSocials() {
  const client = await pool.connect();

  try {
    const socials = await db.query.socials.findMany();
    return {
      socials,
    };
  } catch {
    return {
      message: "Error fetching socials",
    };
  } finally {
    client.release();
  }
}

export type NewUsertoSocial = typeof usersToSocials.$inferInsert;
export async function formatSocialsForInsertion(
  data: {
    instagramProfile: string;
    tiktokProfile: string;
    facebookProfile: string;
  },
  userId: number,
) {
  const socialsRes = await fetchAllSocials();

  const result = Object.entries(data).map(([key, value]) => {
    if (key.includes("Profile") && value) {
      const name = key.replace("Profile", "");
      const social = socialsRes.socials?.find(
        (social: Social) => social.name === name,
      );
      if (social) {
        return {
          socialId: social.id,
          userId,
          username: value,
        };
      }
    }
  });

  return result.filter(Boolean);
}
