import BannersManager from "@/app/dashboard/banners/banners-manager";
import { listMarketingBannersForAdmin } from "@/app/lib/marketing_banners/actions";

export default async function MarketingBannersDashboardPage() {
	const banners = await listMarketingBannersForAdmin();

	return (
		<div className="container p-4 md:p-6">
			<h1 className="text-2xl font-bold mb-2">Carrusel de inicio</h1>
			<p className="text-sm text-muted-foreground mb-6 max-w-2xl">
				Banners que se muestran en la página de inicio y en el portal de participantes.
				Puedes definir visibilidad por audiencia y el enlace al hacer clic.
			</p>
			<BannersManager initialBanners={banners} />
		</div>
	);
}
