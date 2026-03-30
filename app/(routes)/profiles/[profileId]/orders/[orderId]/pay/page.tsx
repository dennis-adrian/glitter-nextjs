import { redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	orderId: z.coerce.number(),
});

export default async function OrderPayRedirectPage(props: {
	params: Promise<{ profileId: string; orderId: string }>;
}) {
	const params = await props.params;
	const parsed = ParamsSchema.safeParse(params);
	if (!parsed.success) redirect("/");
	redirect(`/orders/${parsed.data.orderId}/payment`);
}
