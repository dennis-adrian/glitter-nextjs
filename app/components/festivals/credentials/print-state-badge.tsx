import { Badge } from "@/app/components/ui/badge";
import type { CredentialHolder } from "@/app/lib/credentials/calculate";
import { CREDENTIALS_COPY } from "@/app/lib/credentials/definitions";
import { PRINT_STATE_BADGE, printStateLabel } from "@/app/lib/credentials/print-labels";

/** A holder's print badge: "Nueva", "Impresa el 14 nov", "Faltan 2"… */
export default function PrintStateBadge({ holder }: { holder: CredentialHolder }) {
  if (!holder.print) {
    return (
      <span className="text-xs text-muted-foreground">
        {holder.noCredential ? CREDENTIALS_COPY.noCredential : "—"}
      </span>
    );
  }
  const variant =
    holder.print.nameChanged && holder.print.state === "printed"
      ? "amber"
      : PRINT_STATE_BADGE[holder.print.state];
  return <Badge variant={variant}>{printStateLabel(holder.print)}</Badge>;
}
