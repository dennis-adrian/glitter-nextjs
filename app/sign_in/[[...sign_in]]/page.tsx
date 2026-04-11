import { SignIn } from "@clerk/nextjs";

type PageProps = {
	searchParams: Promise<{ returnUrl?: string | string[] }>;
};

export default async function Page({ searchParams }: PageProps) {
	const { returnUrl } = await searchParams;
	const rawReturnUrl = Array.isArray(returnUrl) ? returnUrl[0] : returnUrl;
	const decodedUrl = rawReturnUrl
		? decodeURIComponent(rawReturnUrl)
		: undefined;
	const safeReturnUrl =
		decodedUrl?.startsWith("/") && !decodedUrl.startsWith("//")
			? decodedUrl
			: undefined;

	return (
		<div className="flex justify-center my-4">
			<SignIn forceRedirectUrl={safeReturnUrl} />
		</div>
	);
}
