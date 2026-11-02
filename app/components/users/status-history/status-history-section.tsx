import StatusHistoryList from "@/app/components/users/status-history/status-history-list";
import { fetchUserStatusHistory } from "@/app/lib/users/status-history";

/** The admin user page's "Historial"; renders nothing for non-admins. */
export default async function StatusHistorySection({
  userId,
  page,
}: {
  userId: number;
  page: number;
}) {
  const history = await fetchUserStatusHistory(userId, page);
  if (!history) return null;

  return (
    <StatusHistoryList
      userId={userId}
      history={history}
      basePath={`/dashboard/users/${userId}`}
    />
  );
}
