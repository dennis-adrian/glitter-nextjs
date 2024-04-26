"use client";

import Autoplay from "embla-carousel-autoplay";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import Image from "next/image";

const carouselItems = [
  "/img/landing/carousel-item-1.png",
  "/img/landing/carousel-item-2.png",
  "/img/landing/carousel-item-3.png",
  "/img/landing/carousel-item-4.png",
  "/img/landing/carousel-item-6.png",
  "/img/landing/carousel-item-7.png",
  "/img/landing/carousel-item-8.png",
  "/img/landing/carousel-item-9.png",
  "/img/landing/carousel-item-10.png",
  "/img/landing/carousel-item-11.png",
];

export default function LandingCarousel() {
  return (
    <Carousel
      className="w-full"
      opts={{
        align: "start",
        loop: true,
      }}
      plugins={[
        Autoplay({
          delay: 5000,
        }),
      ]}
    >
      <CarouselContent>
        {carouselItems.map((src, index) => (
          <CarouselItem
            className="sm:basis-1/2 md:basis-1/3 lg:basis-1/4"
            key={index}
          >
            <div className="flex justify-center">
              <Image
                className="rounded-lg"
                alt={`carousel item ${index}`}
                src={src}
                height={350}
                width={350}
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
