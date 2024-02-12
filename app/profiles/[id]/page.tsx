import { fetchUserProfileById } from "@/app/api/users/actions";
import Image from "next/image";

export default async function Page({ params }: { params: { id: string } }) {
  const res = await fetchUserProfileById(parseInt(params.id));

  if (!res.user) {
    return (
      <div className="flex h-full items-center justify-center text-2xl font-semibold">
        El perfil no existe
      </div>
    );
  }
  return (
    <div className="container h-full px-3 md:px-6">
      <Image
        className="h-[300px] w-full rounded-lg bg-gray-100"
        src="/img/profile-default-banner.png"
        alt="Banner de usuario"
        width={1024}
        height={300}
      />
    </div>
  );
}
