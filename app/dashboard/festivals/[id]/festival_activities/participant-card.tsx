import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";
import { cn } from "@/app/lib/utils";
import { CheckCircle2Icon, CheckIcon } from "lucide-react";
import Image from "next/image";

type ParticipantCardProps = {
	participant: ActivityDetailsWithParticipants["participants"][number];
	index: number;
	selected?: boolean;
	onSelect?: () => void;
};
export default function ParticipantCard({
	participant,
	index,
	selected = true,
	onSelect,
}: ParticipantCardProps) {
	return (
		<div
			className={cn(
				"relative border border-border rounded-md p-2 xs:p-3 w-28 xs:w-36",
				selected && "border-primary",
			)}
			onClick={onSelect ? onSelect : undefined}
		>
			{selected && (
				<div>
					<div className="absolute top-0 right-0 w-0 h-0 border-l-[60px] border-l-transparent border-t-[60px] border-t-primary z-10 animate-in slide-in-from-top-right duration-300 ease-out"></div>
					<CheckCircle2Icon className="absolute top-2 right-2 w-5 h-5 text-white z-20 animate-in zoom-in-50 duration-300 delay-150 ease-out" />
				</div>
			)}
			<div className="flex flex-col items-center gap-1">
				{participant.proofs.length > 0 ? (
					<div className="relative w-20 h-20 xs:w-28 xs:h-28 overflow-hidden rounded-md">
						<Image
							src={participant.proofs[0].imageUrl}
							alt={participant.user.displayName!}
							placeholder="blur"
							blurDataURL="/img/placeholders/placeholder-300x300.png"
							loading="lazy"
							fill
							className="object-cover"
						/>
					</div>
				) : (
					<div className="relative w-20 h-20 xs:w-28 xs:h-28 overflow-hidden rounded-md">
						<Image
							src="/img/placeholders/placeholder-300x300.png"
							alt="No proof"
							loading="lazy"
							fill
							className="object-cover"
						/>
					</div>
				)}
				<p className="text-sm max-w-20 xs:max-w-28 text-ellipsis overflow-hidden">
					#{index + 1} {participant.user.displayName}
				</p>
			</div>
		</div>
	);
}
