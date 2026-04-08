"use client";

import { ProfileType } from "@/app/api/users/definitions";
import MobileUserCard from "@/app/components/molecules/mobile-user-card";

type Props = {
	users: ProfileType[];
};

export default function MobileUsersList({ users }: Props) {
	if (!users.length) {
		return (
			<div className="h-24 rounded-md border text-center text-sm text-muted-foreground flex items-center justify-center">
				Sin resultados
			</div>
		);
	}

	return users.map((user) => <MobileUserCard key={user.id} user={user} />);
}
