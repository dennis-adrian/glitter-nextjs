import { CheckIcon, ClockIcon } from "lucide-react";
import type { ProofDisplayState } from "@/app/lib/festival_activites/types";

export default function EnrolledBadge({
  proofDisplayState,
}: {
  proofDisplayState: ProofDisplayState;
}) {
  const inReview = proofDisplayState === "pending_review";
  const Icon = inReview ? ClockIcon : CheckIcon;
  const label = inReview
    ? "En revisión"
    : proofDisplayState === "approved"
      ? "Aprobado"
      : "Inscrito";

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 ${inReview ? "border-amber-200 bg-amber-50 text-amber-800" : "border-green-200 bg-green-50 text-green-700"}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
