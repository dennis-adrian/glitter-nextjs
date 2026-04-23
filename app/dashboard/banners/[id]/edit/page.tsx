import BannerForm from "@/app/dashboard/banners/banner-form";
import { getMarketingBannerById } from "@/app/lib/marketing_banners/actions";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function EditMarketingBannerPage({ params }: Props) {
	const { id: raw } = await params;
	const id = Number.parseInt(raw, 10);
	if (!Number.isFinite(id) || id < 1) {
		notFound();
	}
	const banner = await getMarketingBannerById(id);
	if (!banner) {
		notFound();
	}

	return (
		<div className="container p-4 md:p-6">
			<BannerForm mode="edit" initialBanner={banner} />
		</div>
	);
}
