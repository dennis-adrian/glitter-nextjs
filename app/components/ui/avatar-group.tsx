import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { AvatarFallback } from "@radix-ui/react-avatar";

export default function AvatarGroup({
  avatarsInfo,
}: {
  avatarsInfo: {
    key: string | number;
    src: string;
    alt: string;
    fallback?: string;
  }[];
}) {
  return (
    <div className="flex justify-center">
      {avatarsInfo.map((info) => {
        return (
          <Avatar key={info.key}>
            <AvatarImage src={info.src} alt={info.alt} />
            <AvatarFallback>{info.fallback}</AvatarFallback>
          </Avatar>
        );
      })}
    </div>
  );
}
