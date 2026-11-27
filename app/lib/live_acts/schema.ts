import { z } from "zod";

import {
  nameValidator,
  phoneValidator,
} from "@/app/components/form/input-validators";
import {
  CULTURAL_ACTIVITY_CATEGORIES,
  CULTURAL_ACTIVITY_COPY,
  CULTURAL_ACTIVITY_DESCRIPTION_MAX_LENGTH,
  CULTURAL_ACTIVITY_DESCRIPTION_MIN_LENGTH,
  CULTURAL_ACTIVITY_MAX_SOCIAL_LINKS,
  CULTURAL_ACTIVITY_MAX_WORKSHOP_CAPACITY,
  CULTURAL_ACTIVITY_OTHER_TYPE_MAX_LENGTH,
  CULTURAL_ACTIVITY_RELATED_OFFER_MAX_LENGTH,
  CULTURAL_ACTIVITY_SPACE_NEEDS_MAX_LENGTH,
  CULTURAL_ACTIVITY_STEPS,
  type CulturalActivityStep,
  type LiveActCategory,
} from "@/app/lib/live_acts/definitions";
import { isHttpUrl } from "@/app/lib/volunteers/schema";

/**
 * The one schema the wizard (client) and the server action both validate
 * with. Each category is its own object, joined as a union on `category`, so
 * a field that does not apply to the chosen category (a workshop capacity
 * sent with music) is stripped from the parsed output instead of stored.
 */

const E = CULTURAL_ACTIVITY_COPY.errors;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, E.tooLong)
    .optional()
    .transform((value) => (value ? value : null));

/** A full http(s) link: `javascript:` and bare handles never reach an href. */
const httpLink = z
  .string({ error: E.link })
  .trim()
  .refine((value) => isHttpUrl(value), { error: E.link });

const fields = {
  otherType: z
    .string({ error: E.otherType })
    .trim()
    .min(2, E.otherType)
    .max(CULTURAL_ACTIVITY_OTHER_TYPE_MAX_LENGTH, E.tooLong),
  actName: z
    .string({ error: E.actNameShort })
    .trim()
    .min(3, E.actNameShort)
    .max(120, E.tooLong),
  requiredDescription: z
    .string({ error: E.descriptionShort })
    .trim()
    .min(CULTURAL_ACTIVITY_DESCRIPTION_MIN_LENGTH, E.descriptionShort)
    .max(CULTURAL_ACTIVITY_DESCRIPTION_MAX_LENGTH, E.tooLong),
  optionalDescription: optionalText(CULTURAL_ACTIVITY_DESCRIPTION_MAX_LENGTH),
  resourceLink: httpLink,
  socialLinks: z
    .array(z.string())
    .optional()
    .transform((links) =>
      (links ?? []).map((link) => link.trim()).filter(Boolean),
    )
    .pipe(
      z.array(httpLink).max(CULTURAL_ACTIVITY_MAX_SOCIAL_LINKS, E.tooManyLinks),
    ),
  workshopCapacity: z.coerce
    .number({ error: E.capacity })
    .int(E.capacity)
    .min(1, E.capacity)
    .max(CULTURAL_ACTIVITY_MAX_WORKSHOP_CAPACITY, E.capacity),
  spaceNeeds: optionalText(CULTURAL_ACTIVITY_SPACE_NEEDS_MAX_LENGTH),
  relatedOffer: optionalText(CULTURAL_ACTIVITY_RELATED_OFFER_MAX_LENGTH),
  noCostAcknowledged: z
    .boolean({ error: E.noCost })
    .refine((value) => value === true, { error: E.noCost }),
};

/** Step 1's fields beyond `category`. */
function tipoShape(category: LiveActCategory) {
  return category === "other" ? { otherType: fields.otherType } : {};
}

/** Step 2's fields for a category. */
function actividadShape(category: LiveActCategory) {
  const base = {
    actName: fields.actName,
    description:
      category === "music"
        ? fields.optionalDescription
        : fields.requiredDescription,
    resourceLink: fields.resourceLink,
    socialLinks: fields.socialLinks,
  };
  switch (category) {
    case "music":
    case "dance":
      return base;
    case "talk":
    case "other":
      return { ...base, spaceNeeds: fields.spaceNeeds };
    case "workshop":
      return {
        ...base,
        workshopCapacity: fields.workshopCapacity,
        spaceNeeds: fields.spaceNeeds,
        relatedOffer: fields.relatedOffer,
        noCostAcknowledged: fields.noCostAcknowledged,
      };
  }
}

const contactoShape = {
  contactName: nameValidator(),
  contactEmail: z
    .string({ error: E.email })
    .trim()
    .toLowerCase()
    .max(254, E.tooLong)
    .pipe(z.email({ error: E.email })),
  contactPhone: phoneValidator(),
  /** Honeypot: people never see it, so it stays empty. */
  website: z.string().max(500).optional().default(""),
};

const categoryLiteral = <C extends LiveActCategory>(category: C) =>
  z.literal(category, { error: E.category });

function variant<C extends LiveActCategory>(category: C) {
  return z.object({
    category: categoryLiteral(category),
    ...tipoShape(category),
    ...actividadShape(category),
    ...contactoShape,
  });
}

export const culturalActivitySchema = z.discriminatedUnion(
  "category",
  [
    variant("music"),
    variant("dance"),
    variant("talk"),
    variant("workshop"),
    variant("other"),
  ],
  { error: E.category },
);

/**
 * One step on its own. Step 1 checks the category (and the free text for
 * "Otra actividad"); step 2 depends on the category chosen there, so it takes
 * it, and without one it fails on `category` like step 1 would.
 */
export function buildCulturalActivityStepSchema(
  step: CulturalActivityStep,
  category: LiveActCategory | null | undefined,
) {
  if (step === "tipo") {
    return z.discriminatedUnion(
      "category",
      [
        z.object({ category: categoryLiteral("music") }),
        z.object({ category: categoryLiteral("dance") }),
        z.object({ category: categoryLiteral("talk") }),
        z.object({ category: categoryLiteral("workshop") }),
        z.object({
          category: categoryLiteral("other"),
          otherType: fields.otherType,
        }),
      ],
      { error: E.category },
    );
  }
  if (step === "contacto") return z.object(contactoShape);
  if (!category || !CULTURAL_ACTIVITY_CATEGORIES.includes(category)) {
    return z.object({
      category: z.enum(CULTURAL_ACTIVITY_CATEGORIES, { error: E.category }),
    });
  }
  return z.object(actividadShape(category));
}

/** Which step owns each field, to send a failed full check to its step. */
export const CULTURAL_ACTIVITY_FIELD_STEPS: ReadonlyMap<string, number> =
  (() => {
    const map = new Map<string, number>();
    map.set("category", 0);
    map.set("otherType", 0);
    for (const category of CULTURAL_ACTIVITY_CATEGORIES) {
      for (const field of Object.keys(actividadShape(category))) {
        map.set(field, 1);
      }
    }
    for (const field of Object.keys(contactoShape)) map.set(field, 2);
    return map;
  })();

export const CULTURAL_ACTIVITY_STEP_COUNT = CULTURAL_ACTIVITY_STEPS.length;

/** Parsed payload after Zod transforms (trimmed, nulled, filtered links). */
export type CulturalActivityValues = z.output<typeof culturalActivitySchema>;
/** Raw form values, as the wizard holds them. */
export type CulturalActivityFormValues = {
  category: LiveActCategory | "";
  otherType: string;
  actName: string;
  description: string;
  resourceLink: string;
  socialLinks: string[];
  workshopCapacity: string;
  spaceNeeds: string;
  relatedOffer: string;
  noCostAcknowledged: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
};
