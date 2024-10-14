import { z } from "zod";

export const ParticipantsParamsSchema = z.object({
  id: z.coerce.number(),
});

export type ParticipantsParamsSchemaType = z.infer<
  typeof ParticipantsParamsSchema
>;
