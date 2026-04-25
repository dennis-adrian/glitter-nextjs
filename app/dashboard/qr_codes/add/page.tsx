import QrCodeForm from "@/app/components/organisms/qr_codes/qr-code-form";

export default function AddQrCodePage() {
	return (
		<div className="container p-4 md:p-6">
			<h1 className="text-2xl font-bold mb-4">Agregar código QR</h1>
			<div className="max-w-lg">
				<QrCodeForm />
			</div>
		</div>
	);
}
