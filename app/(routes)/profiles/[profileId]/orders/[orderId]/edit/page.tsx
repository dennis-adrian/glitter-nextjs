import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { fetchOrder } from "@/app/lib/orders/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import EditOrderForm from "@/app/components/organisms/orders/edit-order-form";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
	orderId: z.coerce.number(),
});

export default async function EditOrderPage(props: {
	params: Promise<z.infer<typeof ParamsSchema>>;
}) {
	const params = await props.params;
	const validatedParams = ParamsSchema.safeParse(params);

	if (!validatedParams.success) {
		return notFound();
	}

	const { profileId, orderId } = validatedParams.data;

	const currentUser = await getCurrentUserProfile();
	await protectRoute(currentUser || undefined, profileId);

	const order = await fetchOrder(orderId);
	if (!order) {
		return notFound();
	}

	// Only pending orders are editable — redirect others back to detail
	if (order.status !== "pending") {
		redirect(`/profiles/${profileId}/orders/${orderId}`);
	}

	return (
		<div className="container p-3 md:p-6">
			<EditOrderForm order={order} profileId={profileId} />
		</div>
	);
}
