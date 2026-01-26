"use client";

import * as htmlToImage from "html-to-image";
import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import { DownloadIcon } from "lucide-react";

export default function QrCodeDownload({ qrCodeUrl }: { qrCodeUrl?: string }) {
	const [downloading, setDownloading] = useState(false);
	const qrCodeRef = useRef<HTMLImageElement>(null);

	if (!qrCodeUrl)
		return (
			<div className="text-muted-foreground">
				<span>No se encontró un código QR para el pago</span>
			</div>
		);

	const downloadQRCode = async () => {
		setDownloading(true);
		const dataUrl = await htmlToImage.toPng(qrCodeRef.current!);

		const link = document.createElement("a");
		link.download = "pago-de-espacio.png";
		link.href = dataUrl;
		link.click();
		setDownloading(false);
	};
	return (
		<div className="my-4 flex flex-col items-center gap-2">
			<Image
				ref={qrCodeRef}
				className="mx-auto"
				alt="Código QR"
				src={qrCodeUrl}
				width={240}
				height={240}
			/>
			<Button
				disabled={downloading}
				className="w-full md:max-w-fit"
				variant="outline"
				onClick={downloadQRCode}
			>
				{downloading ? (
					<>Descargando...</>
				) : (
					<>
						Descargar código QR
						<DownloadIcon className="ml-2 w-4 h-4" />
					</>
				)}
			</Button>
		</div>
	);
}
