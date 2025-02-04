import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-64px-180px)] md:min-h-[calc(100vh-80px-148px)] flex justify-center items-center">
      <div className="flex w-full justify-center items-center gap-2 my-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <p>Validando tu perfil</p>
      </div>
    </div>
  );
}
