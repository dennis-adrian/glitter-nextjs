import { Loader2Icon } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-64px-200px)] md:min-h-[calc(100vh-80px-148px)] flex justify-center items-center">
      <Loader2Icon className="animate-spin" size="64" />
    </div>
  );
}
