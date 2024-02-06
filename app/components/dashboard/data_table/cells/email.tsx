import { CopyIcon } from "lucide-react";
import { HTMLAttributes } from "react";
import { toast } from "sonner";

export function EmailCell({ email }: { email: string }) {
  return (
    <div className="flex max-w-48 sm:max-w-full">
      <span className="truncate">{email}</span>
      <CopyIcon
        onClick={() => {
          navigator.clipboard.writeText(email);
          toast.success("Copiado", {
            duration: 1000,
          });
        }}
        className="h-4 w-4 text-muted-foreground cursor-pointer ml-1"
      />
    </div>
  );
}
