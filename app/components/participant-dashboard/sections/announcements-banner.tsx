import { MegaphoneIcon } from "lucide-react";

export default function AnnouncementsBanner() {
	return (
		<div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
			<MegaphoneIcon className="w-5 h-5 text-primary shrink-0" />
			<p className="text-sm text-muted-foreground">
				Mantente atento a este espacio para novedades sobre nuestros
				festivales.
			</p>
		</div>
	);
}
