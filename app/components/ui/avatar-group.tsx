import { Avatar, AvatarImage } from "@/app/components/ui/avatar";

export default function AvatarGroup({
  avatarsInfo,
}: {
  avatarsInfo: {
    key: string | number;
    src: string;
    alt: string;
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
          </div>
        );
      })}
    </div>
  );
}
