import { z } from "zod";

export const ReservationsSearchParamsSchema = z.object({
  query: z.string().trim().prefault(""),
  festivalId: z.coerce.number().optional(),
});

export type ReservationsSearchParamsSchemaType = z.infer<
  typeof ReservationsSearchParamsSchema
>;
