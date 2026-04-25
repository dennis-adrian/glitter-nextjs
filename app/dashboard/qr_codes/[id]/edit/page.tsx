import QrCodeForm from "@/app/components/organisms/qr_codes/qr-code-form";
import ResourceNotFound from "@/app/components/resource-not-found";
import { fetchQrCode } from "@/app/lib/qr_codes/actions";
import { z } from "zod";

const ParamsSchema = z.object({ id: z.coerce.number() });

export default async function EditQrCodePage(props: {
	params: Promise<{ id: string }>;
}) {
	const params = await props.params;
	const validated = ParamsSchema.safeParse(params);
	if (!validated.success) return <ResourceNotFound />;

	const qrCode = await fetchQrCode(validated.data.id);
	if (!qrCode) return <ResourceNotFound />;

	return (
		<div className="container p-4 md:p-6">
			<h1 className="text-2xl font-bold mb-4">Editar código QR</h1>
			<div className="max-w-lg">
				<QrCodeForm qrCode={qrCode} />
			</div>
		</div>
	);
}
