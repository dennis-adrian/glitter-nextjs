/**
 * The old tool's classifier, copied from dennis-adrian/credentials-classifier
 * at commit 91a3792 (`src/utils/index.ts` and `src/types`), so the parity
 * test can prove the new per-stand rule reproduces it for single stands.
 * Only the two `console.log` calls were removed. Test fixture: do not import
 * from app code.
 */

export type Category = "illustration" | "entrepreneurship" | "gastronomy";

export type CredentialData = {
  category: Category;
  participant: string;
  stand: string;
};

export type ClasifiedCredentialsData = {
  [key in Category]: {
    participantWithStand: {
      participant: string;
      stand: string;
    }[];
    namedCredentialsCount: number;
    unamedCredentialsCount: number;
  };
};

export const clasifyCredentials = (
  data: CredentialData[],
): ClasifiedCredentialsData => {
  const illustrationParticipations = data.filter(
    (item) => item.category === "illustration",
  );
  const entrepreneurshipParticipations = data.filter(
    (item) => item.category === "entrepreneurship",
  );
  const gastronomyParticipations = data.filter(
    (item) => item.category === "gastronomy",
  );

  const illustrationParticipationsByStand = illustrationParticipations.reduce(
    (acc, item) => {
      acc[item.stand] = (acc[item.stand] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  /**
   * Illustraiotn participants that don't share a stand should receive a second unnamed credential
   */
  const illustrationUniqueStands: string[] = [];
  for (const stand in illustrationParticipationsByStand) {
    if (illustrationParticipationsByStand[stand] === 1) {
      illustrationUniqueStands.push(stand);
    }
  }

  return {
    illustration: {
      participantWithStand: illustrationParticipations.map((item) => ({
        participant: item.participant,
        stand: item.stand,
      })),
      namedCredentialsCount: illustrationParticipations.length,
      unamedCredentialsCount: illustrationUniqueStands.length,
    },
    entrepreneurship: {
      participantWithStand: entrepreneurshipParticipations.map((item) => ({
        participant: item.participant,
        stand: item.stand,
      })),
      namedCredentialsCount: entrepreneurshipParticipations.length,
      unamedCredentialsCount: entrepreneurshipParticipations.length,
    },
    gastronomy: {
      participantWithStand: gastronomyParticipations.map((item) => ({
        participant: item.participant,
        stand: item.stand,
      })),
      /**
       * Every gastronomy participant should receive two named credentials
       */
      namedCredentialsCount: gastronomyParticipations.length * 2,
      unamedCredentialsCount: 0,
    },
  };
};
