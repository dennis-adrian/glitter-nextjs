import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import {
	Card,
	CardTitle,
	CardHeader,
	CardDescription,
} from "@/app/components/ui/card";
import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";

type PublicFestivalActivityDetailProps = {
	detail: ActivityDetailsWithParticipants;
};

export default function PublicFestivalActivityDetail({
	detail,
}: PublicFestivalActivityDetailProps) {
	return (
		<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
			{detail.participants.map((participant) => {
				return (
					<div
						key={participant.id}
						className="flex items-center gap-2 bg-card border border-border rounded-md p-2 shadow-sm"
					>
						<Avatar>
							<AvatarImage
								src={participant.user.imageUrl || ""}
								alt={participant.user.displayName || "avatar de usuario"}
							/>
						</Avatar>
						<div>
							<h3 className="text-sm text-muted-foreground font-medium">
								{participant.user.displayName}
							</h3>
						</div>
					</div>
				);
			})}
		</div>
	);
}
