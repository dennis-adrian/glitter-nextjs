import QrCodesTable from "@/app/components/organisms/qr_codes/table/qr-codes-table";
import { RedirectButton } from "@/app/components/redirect-button";
import { fetchQrCodes } from "@/app/lib/qr_codes/actions";
import { Suspense } from "react";

async function QrCodesTableLoader() {
	const qrCodes = await fetchQrCodes();
	return <QrCodesTable qrCodes={qrCodes} />;
}

export default function QrCodesPage() {
	return (
		<div className="container p-4 md:p-6">
			<h1 className="text-2xl font-bold">Códigos QR</h1>
			<div className="my-4 w-full">
				<RedirectButton href="/dashboard/qr_codes/add">
					Agregar código QR
				</RedirectButton>
				<div className="mt-4">
					<Suspense fallback={<div>Cargando...</div>}>
						<QrCodesTableLoader />
					</Suspense>
				</div>
			</div>
		</div>
	);
}
