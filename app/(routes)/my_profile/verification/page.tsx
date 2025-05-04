import {
	fetchUserProfileByClerkId,
	getCurrentClerkUser,
} from "@/app/lib/users/actions";
import { redirect } from "next/navigation";

export default async function ProfileVerificationPage() {
	const user = await getCurrentClerkUser();
	if (!user) return null;

	const profile = await fetchUserProfileByClerkId(user.id);
	if (!profile) redirect("/my_profile/creation");

	return redirect("/my_profile");
}
