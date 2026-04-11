import { SignIn } from "@clerk/nextjs";

type PageProps = {
	searchParams: Promise<{ returnUrl?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
	const { returnUrl } = await searchParams;
	const safeReturnUrl =
		returnUrl?.startsWith("/") && !returnUrl.startsWith("//")
			? returnUrl
			: undefined;

	return (
		<div className="flex justify-center my-4">
			<SignIn forceRedirectUrl={safeReturnUrl} />
		</div>
	);
}
