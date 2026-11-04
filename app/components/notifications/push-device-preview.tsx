import Image from "next/image";

/**
 * A push as a phone's lock screen shows it, for previews before sending:
 * the comunicado composer and "Activar festival".
 */
export default function PushDevicePreview({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-slate-950 p-4 pb-10">
      <p
        className="mb-4 text-center text-3xl font-light tabular-nums text-white/90"
        aria-hidden
      >
        9:41
      </p>
      <div className="rounded-2xl bg-white/85 p-3 text-slate-900 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Image
            src="/icons/glitter-192.png"
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 rounded-md"
          />
          <span className="font-semibold uppercase tracking-wide">Glitter</span>
          <span className="ml-auto">ahora</span>
        </div>
        <p className="mt-1.5 text-sm font-semibold leading-snug">{title}</p>
        <p className="text-sm leading-snug text-slate-700">{body}</p>
      </div>
    </div>
  );
}
