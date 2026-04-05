import StoreNav from "@/app/components/organisms/store/store-nav";
import { fetchPendingVoucherCount } from "@/app/lib/orders/actions";
import Heading from "@/app/components/atoms/heading";

export default async function StoreLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pendingCount = await fetchPendingVoucherCount();

	return (
		<div className="container space-y-6 px-3 py-4 md:px-6 md:py-6">
			<div className="space-y-2">
				<Heading level={2}>Admin Tienda</Heading>
				<p className="text-muted-foreground text-sm md:text-base">
					Gestiona productos, pedidos y comprobantes de pago desde un solo
					lugar.
				</p>
			</div>

			<StoreNav pendingCount={pendingCount} />

			{children}
		</div>
	);
}
