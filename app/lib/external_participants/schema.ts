import { z } from "zod";

import { phoneValidator } from "@/app/components/form/input-validators";
import { externalParticipantTypeEnum } from "@/db/schema";

function isAcceptedExternalParticipantImageUrl(value?: string) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "utfs.io" ||
        url.hostname === "ufs.sh" ||
        url.hostname.endsWith(".ufs.sh"))
    );
  } catch {
    return false;
  }
}

export const externalParticipantInputSchema = z.object({
  displayName: z.string().trim().min(2, "El nombre es requerido"),
  type: z.enum(externalParticipantTypeEnum.enumValues),
  customCategoryLabel: z.string().trim().optional(),
  description: z.string().trim().optional(),
  imageUrl: z
    .string()
    .trim()
    .optional()
    .refine(isAcceptedExternalParticipantImageUrl, {
      message: "La imagen debe subirse desde el formulario",
    }),
  websiteUrl: z.url().optional().or(z.literal("")),
  instagramUrl: z.url().optional().or(z.literal("")),
  contactEmail: z
    .email("Ingresá un correo válido")
    .optional()
    .or(z.literal("")),
  contactPhone: z.union([phoneValidator(), z.literal("")]).optional(),
});

export type ExternalParticipantInput = z.infer<
  typeof externalParticipantInputSchema
>;
