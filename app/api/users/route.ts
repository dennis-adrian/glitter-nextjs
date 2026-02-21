import { updateProfile } from "@/app/lib/users/actions";
import { z } from "zod";

const RequestSchema = z.object({
  profileId: z.coerce.number(),
  imageUrl: z.string(),
});

export async function PUT(req: Request) {
  const validatedRequest = RequestSchema.safeParse(await req.json());
  if (!validatedRequest.success) {
    return new Response(
      JSON.stringify({
        message: "Datos inválidos",
        errors: z.treeifyError(validatedRequest.error),
        success: false,
      }),
      {
        status: 400,
      },
    );
  }

  const { profileId, imageUrl } = validatedRequest.data;
  const response = await updateProfile(profileId, {
    imageUrl,
  });

  if (!response.success) {
    return new Response(JSON.stringify(response), { status: 400 });
  }

  return new Response(JSON.stringify(response), { status: 200 });
}
