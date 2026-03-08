import Heading from "@/app/components/atoms/heading";
import OrdersList from "@/app/components/organisms/profile-orders/orders-list";
import { fetchOrdersByUserId } from "@/app/lib/orders/actions";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

export default async function MyOrdersPage() {
	const currentProfile = await getCurrentBaseProfile();
	if (!currentProfile) {
		notFound();
	}

	const ordersPromise = fetchOrdersByUserId(currentProfile.id);

	return (
		<div className="container p-3 md:p-6">
			<Heading>Mis pedidos</Heading>
			<p>Aquí podés ver los pedidos que realizaste</p>
			<div className="mt-4">
				<OrdersList ordersPromise={ordersPromise} />
			</div>
		</div>
	);
}
