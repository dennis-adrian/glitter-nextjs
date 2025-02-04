import { Loader2 } from "lucide-react";

export default async function Loading() {
  return (
    <div className="min-h-[calc(100vh-64px-180px)] md:min-h-[calc(100vh-80px-148px)] flex justify-center items-center">
      <div className="flex w-full justify-center items-center gap-2 flex-col my-8">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="">Validando tu perfil</p>
      </div>
    </div>
  );
}
