import TermsPage from "@/app/components/pages/profiles/festivals/terms";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  profileId: z.coerce.number(),
});

export default async function Page(
  props: {
    params: Promise<{ festivalId: string; profileId: string }>;
  }
) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  return (
    <TermsPage
      profileId={validatedParams.data.profileId}
      festivalId={validatedParams.data.festivalId}
    />
  );
}
