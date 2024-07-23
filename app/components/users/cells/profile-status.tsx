import { BaseProfile } from "@/app/api/users/definitions";
import { getProfileStatusLabel } from "@/app/lib/users/utils";
import {
  BanIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  XCircle,
  XCircleIcon,
  XIcon,
} from "lucide-react";

export default function ProfileStatusCell({
  status,
}: {
  status: BaseProfile["status"];
}) {
  let icon;
  if (status === "verified") {
    icon = <CheckCircleIcon className="w-4 h-4 text-green-500" />;
  }

  if (status === "pending") {
    icon = <CircleDashedIcon className="w-4 h-4 text-amber-500" />;
  }

  if (status === "rejected") {
    icon = <XCircleIcon className="w-4 h-4 text-gray-500" />;
  }

  if (status === "banned") {
    icon = <BanIcon className="w-4 h-4 text-red-500" />;
  }

  return (
    <span className="flex gap-2 items-center">
      {icon}
      <span className="capitalize">{getProfileStatusLabel(status)}</span>
    </span>
  );
}
