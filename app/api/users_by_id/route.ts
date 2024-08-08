import { fetchProfilesByIds } from "@/app/api/users/actions";
import { z } from "zod";

const RequestSchema = z.object({
  ids: z.array(z.coerce.number()),
});

export async function POST(req: Request) {
  const validatedRequest = RequestSchema.safeParse(await req.json());
  if (!validatedRequest.success) {
    return new Response(
      JSON.stringify({
        message: "Datos inválidos",
        errors: validatedRequest.error.flatten().fieldErrors,
        success: false,
      }),
      {
        status: 400,
      },
    );
  }

  if (validatedRequest.data.ids.length === 0) {
    return new Response(JSON.stringify([]), { status: 200 });
  }

  const profiles = await fetchProfilesByIds(validatedRequest.data.ids);
  return new Response(JSON.stringify(profiles), { status: 200 });
}
