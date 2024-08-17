import { z } from "zod";

export const SearchParamsSchema = z.object({
  limit: z.coerce.number().default(10),
  offset: z.coerce.number().default(0),
  includeAdmins: z.coerce.boolean().default(false),
});

export type SearchParamsSchemaType = z.infer<typeof SearchParamsSchema>;
