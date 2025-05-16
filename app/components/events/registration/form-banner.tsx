import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { FestivalInfo } from "@/components/landing/festival-info-card";
import Image from "next/image";

export function FormBanner({ festival }: { festival: FestivalWithDates }) {
  const mascotSrc = festival.mascotUrl;
  return (
    <>
      <div className="text-primary-foreground relative mt-5 flex w-full items-center justify-center p-6 sm:mt-0">
        {festival.festivalType === "twinkler" ? (
          <Image
            className="-z-10 rounded-2xl object-cover brightness-50"
            src="/img/twinkler/twinkler-banner-500x500.png"
            alt="Festival Image"
            quality={100}
            fill
          />
        ) : (
          <Image
            className="-z-10 rounded-2xl object-cover"
            src="/img/landing-banner-sm.png"
            alt="Festival Image"
            quality={100}
            fill
          />
        )}
        <div className="flex gap-2 sm:gap-4 lg:flex-col w-full items-center justify-between">
          <div className="bg-black/5 h-fit w-full py-4 rounded-lg backdrop-blur-xl">
            <h1 className="text-center text-2xl font-semibold">
              {festival.name}
            </h1>
            <FestivalInfo className="py-2" festival={festival} />
          </div>
          {mascotSrc && (
            <Image
              className="hidden md:block rounded-md"
              src={mascotSrc}
              alt="Mascota Glitter"
              height={320}
              width={320}
            />
          )}
        </div>
      </div>
    </>
  );
}
