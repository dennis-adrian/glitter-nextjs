import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

export default function DateBadge({ date }: { date: Date | DateTime }) {
  const formattedDate = date instanceof DateTime ? date : formatDate(date);

  return (
    <div className="w-12 h-12 rounded-sm flex flex-col">
      <span className="text-muted-foreground text-xs text-center bg-red-500 text-white rounded-t-sm">
        {formattedDate.toLocaleString({ month: "short" })}
      </span>
      <span className="flex items-center justify-center border rounded-b-sm h-full text-lg">
        {formattedDate.toLocaleString({ day: "numeric" })}
      </span>
    </div>
  );
}
