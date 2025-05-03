import { ProfileType } from "@/app/api/users/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import { fetchLatestInvoiceByProfileId } from "@/app/data/invoices/actions";
import { ArrowUpRightIcon } from "lucide-react";
import AnnouncementCard from "@/components/user_profile/announcements_cards/card";
import { DateTime } from "luxon";
import { formatDate } from "@/app/lib/formatters";

type UserProfileBannerProps = {
	profile: ProfileType;
};

export default async function UserProfileBanner({
	profile,
}: UserProfileBannerProps) {
	const latestInvoice = await fetchLatestInvoiceByProfileId(profile.id);
	const hasPendingPayment =
		latestInvoice?.status === "pending" &&
		latestInvoice.reservation.status === "pending";

	if (!hasPendingPayment) {
		if (profile.status !== "banned") {
			return (
				<>
					{/* FIXME: Find a way to make this dynamic. It was added specifically for the Festicker */}
					{/* <FestivalActivityBanner profile={profile} /> */}
					<AnnouncementCard profile={profile} />
				</>
			);
		} else {
			return null;
		}
	}

	const {
		reservation: { festivalId },
		reservationId,
		date,
	} = latestInvoice;
	const paymentDueDate = formatDate(
		DateTime.fromJSDate(date).plus({ hours: 120 }).toJSDate(),
	);

	return (
		<div className="sticky top-2 z-10 w-full bg-background">
			<div className="bg-emerald-100 text-emerald-900 border-emerald-300 border p-3 rounded-md text-sm">
				<div className="flex flex-col items-center gap-1">
					<span>
						Tenés un pago pendiente. Hacé el pago antes del{" "}
						{paymentDueDate.toLocaleString(DateTime.DATE_SHORT)} a las{" "}
						{paymentDueDate.toLocaleString(DateTime.TIME_SIMPLE)} para no perder
						tu reserva.
					</span>
					<RedirectButton
						variant="link"
						size="sm"
						className="text-emerald-900 underline"
						href={`/profiles/${profile.id}/festivals/${festivalId}/reservations/${reservationId}/payments`}
					>
						Realizar pago
						<ArrowUpRightIcon className="ml-2 w-4 h-4" />
					</RedirectButton>
				</div>
			</div>
		</div>
	);
}
