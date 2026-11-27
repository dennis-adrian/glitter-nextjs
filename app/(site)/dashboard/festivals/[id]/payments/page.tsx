import { permanentRedirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

/**
 * The payments table lived here, rooted at the invoice; the reservations table
 * lived one route over, rooted at the reservation it belongs to. One invoice
 * per reservation made them the same row, and they had already drifted into
 * showing different answers about it.
 *
 * Kept as a redirect rather than deleted: `payment-confirmation-for-admins`
 * links here, and so do the browser histories of everyone who worked the queue.
 */
export default async function PaymentsPage(props: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const params = await props.params;
  const validated = ParamsSchema.safeParse(params);
  permanentRedirect(
    validated.success
      ? `/dashboard/festivals/${validated.data.id}/reservations?lens=cobros`
      : "/dashboard/festivals",
  );
}
