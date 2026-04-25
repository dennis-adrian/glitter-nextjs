import TermsPage from "@/app/components/pages/profiles/festivals/terms";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	id: z.coerce.number(),
});

type PageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: PageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) notFound();

	const festivalId = validatedParams.data.id;

	const currentProfile = await getCurrentUserProfile();
	if (!currentProfile) {
		redirect(`/sign_in?returnUrl=/festivals/${festivalId}/terms`);
	}

	return <TermsPage profileId={currentProfile.id} festivalId={festivalId} />;
}
