import { Loader2Icon } from "lucide-react";
import Image from "next/image";

export default function Loading() {
  return (
		<div className="min-h-[calc(100vh-64px-180px)] md:min-h-[calc(100vh-80px-148px)] flex justify-center items-center">
			<div className="flex flex-col w-full justify-center items-center gap-2 my-8 text-muted-foreground">
				<Image
					src="/img/logo/glitter-logo-dark-160x160.png"
					alt="logo"
					width={80}
					height={80}
				/>
				<div className="flex items-center gap-2 text-primary-500">
					<Loader2Icon className="w-4 h-4 animate-spin" />
					<p>Cargando perfil...</p>
				</div>
			</div>
		</div>
	);
}
