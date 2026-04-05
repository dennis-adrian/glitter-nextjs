"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";

type ApprovedPromo = {
	name: string;
	promoDescription: string;
	promoConditions: string | null;
};

type ExportProofsButtonProps = {
	approvedPromos: ApprovedPromo[];
};

export default function ExportProofsButton({
	approvedPromos,
}: ExportProofsButtonProps) {
	const handleExport = () => {
		const lines = approvedPromos.map((p) => {
			const parts = [p.name, `Promoción: ${p.promoDescription}`];
			if (p.promoConditions) {
				parts.push(`Condiciones: ${p.promoConditions}`);
			}
			return parts.join("\n");
		});

		const content = lines.join("\n\n---\n\n");
		const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "promociones-aprobadas.txt";
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 100);
	};

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleExport}
			disabled={approvedPromos.length === 0}
		>
			<DownloadIcon className="w-4 h-4 mr-1" />
			Exportar aprobadas ({approvedPromos.length})
		</Button>
	);
}
