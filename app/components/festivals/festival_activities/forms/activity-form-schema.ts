import { DateTime } from "luxon";
import { z } from "zod";
import { STORE_TIMEZONE } from "@/app/lib/formatters";

export function toDatetimeLocal(date: Date | null | undefined): string {
  return date
    ? DateTime.fromJSDate(new Date(date), { zone: STORE_TIMEZONE }).toFormat(
        "yyyy-MM-dd'T'HH:mm",
      )
    : "";
}

export function parseActivityDate(value: string): Date {
  return DateTime.fromISO(value, { zone: STORE_TIMEZONE }).toJSDate();
}

const optionalPositiveInteger = z
  .number()
  .int("Usá un número entero")
  .positive("Ingresá un número mayor a cero")
  .optional();
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
  DateTime.fromISO(value, { zone: STORE_TIMEZONE }).isValid;
const requiredDate = z
  .string()
  .refine(validDate, "Completá la fecha y la hora");
const optionalDate = z.string().optional();

export const ActivityFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres"),
    description: z.string().trim().optional(),
    visitorsDescription: z.string().trim().optional(),
    type: z.enum([
      "stamp_passport",
      "sticker_print",
      "best_stand",
      "festival_sticker",
      "coupon_book",
      "sticker_hunt",
    ]),
    accessLevel: z.enum(["public", "festival_participants_only"]),
    promotionalArtUrl: z.string().optional(),
    activityPrizeUrl: z.string().optional(),
    registrationStartDate: requiredDate,
    registrationEndDate: requiredDate,
    proofType: z.enum(["image", "text", "both"]).nullable().optional(),
    proofUploadLimitDate: optionalDate,
    allowsVoting: z.boolean(),
    votingStartDate: optionalDate,
    votingEndDate: optionalDate,
    waitlistEnabled: z.boolean(),
    waitlistWindowMinutes: z.number().optional(),
    details: z
      .array(
        z.object({
          id: z.number().optional(),
          description: z.string().optional(),
          participationLimit: optionalPositiveInteger,
          category: z
            .enum([
              "illustration",
              "gastronomy",
              "entrepreneurship",
              "new_artist",
            ])
            .nullable()
            .optional(),
          imageUrl: z.string().optional(),
          couponBookHeaderImageUrl: z.string().optional(),
        }),
      )
      .min(1, "Agregá al menos una variante"),
  })
  .superRefine((data, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (
      validDate(data.registrationStartDate) &&
      validDate(data.registrationEndDate) &&
      data.registrationEndDate <= data.registrationStartDate
    ) {
      issue(
        "registrationEndDate",
        "El cierre debe ser posterior a la apertura",
      );
    }
    if (
      data.proofType &&
      (!data.proofUploadLimitDate || !validDate(data.proofUploadLimitDate))
    ) {
      issue(
        "proofUploadLimitDate",
        "Indicá hasta cuándo se puede enviar el material",
      );
    }
    if (data.allowsVoting) {
      if (!data.votingStartDate || !validDate(data.votingStartDate))
        issue("votingStartDate", "Indicá cuándo comienza la votación");
      if (!data.votingEndDate || !validDate(data.votingEndDate))
        issue("votingEndDate", "Indicá cuándo termina la votación");
      if (
        data.votingStartDate &&
        data.votingEndDate &&
        validDate(data.votingStartDate) &&
        validDate(data.votingEndDate) &&
        data.votingEndDate <= data.votingStartDate
      ) {
        issue(
          "votingEndDate",
          "El cierre debe ser posterior al inicio de la votación",
        );
      }
    }
    if (
      data.waitlistEnabled &&
      (data.waitlistWindowMinutes === undefined ||
        !Number.isInteger(data.waitlistWindowMinutes) ||
        data.waitlistWindowMinutes <= 0)
    ) {
      issue("waitlistWindowMinutes", "Elegí cuánto tiempo dura la invitación");
    }
  });

export type ActivityFormValues = z.infer<typeof ActivityFormSchema>;
