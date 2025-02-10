import { cn } from "@/app/lib/utils";
import { XIcon } from "lucide-react";

type Props = {
  content: string | React.ReactNode;
  className?: string;
  removable?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
};

// TODO: Add variants
export default function Tag({
  content,
  className,
  removable,
  onClick,
  onRemove,
}: Props) {
  return (
    <div
      className={cn(
        "bg-primary-500 text-sm text-white px-2 py-1 rounded-sm w-fit flex items-center gap-1",
        className,
      )}
      onClick={() => onClick && onClick()}
    >
      {content}
      {removable && onRemove && (
        <XIcon className="w-4 h-4" onClick={onRemove} />
      )}
    </div>
  );
}
