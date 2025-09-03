import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Tooltip } from "react-tooltip";
import { ParticipantCardData } from "./public-festival-activity-detail";
import { CheckCircle2Icon } from "lucide-react";

type PublicFestivalActivityParticipantCardProps = {
	participant: ParticipantCardData;
	selected: boolean;
	onSelect: () => void;
};

export default function PublicFestivalActivityParticipantCard({
	participant,
	selected,
	onSelect,
}: PublicFestivalActivityParticipantCardProps) {
	return (
		<div
			className="relative bg-card border border-border rounded-md p-2 shadow-xs"
			onClick={onSelect}
		>
			{selected && (
				<div>
					<div className="absolute top-0 right-0 w-0 h-0 border-l-[60px] border-l-transparent border-t-[60px] border-t-primary z-10 animate-in slide-in-from-top-right duration-300 ease-out"></div>
					<CheckCircle2Icon className="absolute top-2 right-2 w-5 h-5 text-white z-20 animate-in zoom-in-50 duration-300 delay-150 ease-out" />
				</div>
			)}
			<div className="flex items-center gap-2">
				<Avatar className="w-10 md:w-16 h-10 md:h-16">
					<AvatarImage
						src={participant.participantImageUrl || ""}
						alt={participant.participantName || "avatar de usuario"}
					/>
				</Avatar>
				<div className="flex flex-col gap-1 max-w-fit">
					<Tooltip
						id={`participant-${participant.participantId}`}
						content={participant.participantName}
					/>
					<h3
						data-tooltip-id={`participant-${participant.participantId}`}
						className="leading-tight text-sm md:text-base xxs:max-w-full xs:max-w-[95px] sm:max-w-full overflow-hidden text-ellipsis"
					>
						{participant.participantName}
					</h3>
					<p className="text-sm text-muted-foreground">
						{participant.standLabel}
					</p>
				</div>
			</div>
		</div>
	);
}
