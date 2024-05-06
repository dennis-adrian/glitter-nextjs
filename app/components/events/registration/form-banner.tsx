"use client";

import Image from "next/image";

import { FestivalBase } from "@/app/data/festivals/definitions";
import { FestivalInfo } from "@/components/landing/festival-info-card";
import { imagesSrc } from "@/app/lib/maps/config";

export function FormBanner({ festival }: { festival: FestivalBase }) {
  const mascotSrc = imagesSrc[festival.mapsVersion].mascot?.sm;
  return (
    <>
      <div className="text-primary-foreground relative mt-5 flex w-full items-center justify-center p-6 sm:mt-0">
        <Image
          className="-z-10 rounded-2xl object-cover"
          src="/img/landing-banner-sm.png"
          alt="Festival Image"
          quality={100}
          fill
        />
        <div className="flex gap-2 sm:gap-4 lg:flex-col w-full items-center justify-between">
          <div className="bg-white/30 h-fit w-full py-4 rounded-lg backdrop-blur-xl">
            <h1 className="text-center text-2xl font-semibold">
              {festival.name}
            </h1>
            <FestivalInfo className="py-2" festival={festival} />
          </div>
          {mascotSrc ? (
            <Image
              className="hidden md:block"
              src={mascotSrc}
              alt="Mascota Glitter"
              height={320}
              width={320}
            />
          ) : (
            <Image
              className="hidden md:block"
              src="/img/glitter-mascot.png"
              alt="Mascota Glitter"
              height={328}
              width={255}
            />
          )}
        </div>
      </div>
    </>
  );
}
