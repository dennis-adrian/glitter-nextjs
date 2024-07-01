import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";

export default function AvatarGroup({
  avatarsInfo,
}: {
  avatarsInfo: {
    key: string | number;
    src: string;
    alt: string;
    newUser?: boolean;
  }[];
}) {
  return (
    <div className="flex justify-center -space-x-4">
      {avatarsInfo.map((info) => {
        return (
          <div key={info.key} className="relative flex justify-center">
            <Avatar>
              <AvatarImage src={info.src} alt={info.alt} />
            </Avatar>
            {info.newUser && (
              <div className="absolute -bottom-2">
                <Badge className="bg-white text-foreground" variant="outline">
                  Nuevo
                </Badge>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
