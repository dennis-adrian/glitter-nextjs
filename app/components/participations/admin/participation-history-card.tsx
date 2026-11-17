import ParticipationHistoryList from "@/app/components/participations/admin/participation-history-list";
import { fetchAdminParticipationHistory } from "@/app/lib/participations/admin-history-queries";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/** The admin user page's participation history, read for `userId`. */
export default async function ParticipationHistoryCard({
  userId,
  userName,
}: {
  userId: number;
  userName: string;
}) {
  const [actor, rows] = await Promise.all([
    getCurrentUserProfile(),
    fetchAdminParticipationHistory(userId),
  ]);

  return (
    <ParticipationHistoryList
      rows={rows}
      userId={userId}
      userName={userName}
      canTransfer={canMutateAdminReservations(actor)}
    />
  );
}
