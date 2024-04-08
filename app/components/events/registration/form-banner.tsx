"use client";

import Image from "next/image";

import { FestivalBase } from "@/app/data/festivals/definitions";
import { FestivalInfo } from "@/components/landing/festival-info-card";

export function FormBanner({ festival }: { festival: FestivalBase }) {
  return (
    <>
      <div className="text-primary-foreground relative mt-5 flex w-full items-center justify-center p-6 sm:mt-0">
        <Image
          className="-z-10 rounded-2xl object-cover"
          src="/img/bg_w_1280.png"
          alt="Festival Image"
          quality={100}
          fill
        />
        <div className="flex items-center gap-2 sm:gap-4 md:flex-col">
          <div className="relative hidden h-28 w-28 md:block">
            <Image
              src="/img/mascot.png"
              alt="Mascota Glitter"
              quality={100}
              fill
            />
          </div>
          <div>
            <h1 className="text-center text-2xl font-semibold">
              {festival.name}
            </h1>
            <FestivalInfo
              className="py-2 text-sm md:text-sm"
              festival={festival}
            />
          </div>
        </div>
      </div>
    </>
  );
}
