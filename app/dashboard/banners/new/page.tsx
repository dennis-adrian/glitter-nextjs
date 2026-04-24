import BannerForm from "@/app/dashboard/banners/banner-form";

export default function NewMarketingBannerPage() {
	return (
		<div className="container p-4 md:p-6">
			<BannerForm mode="create" />
		</div>
	);
}
