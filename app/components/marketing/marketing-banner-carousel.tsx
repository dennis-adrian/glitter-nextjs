"use client";

import Autoplay from "embla-carousel-autoplay";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/app/components/ui/carousel";
import SmoothScrollLink from "@/app/components/ui/smooth-scroll-link";
import type { MarketingBannerRow } from "@/app/lib/marketing_banners/definitions";
import { resolveSlideImages } from "@/app/lib/marketing_banners/resolve-slide-images";

type Props = {
  banners: MarketingBannerRow[];
};

function slideAlt(banner: MarketingBannerRow): string {
  return banner.altText?.trim() || banner.label?.trim() || "Banner promocional";
}

const linkFrameClass =
  "relative block min-h-0 w-full overflow-hidden rounded-lg bg-muted aspect-3/2 max-h-[240px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring md:max-h-[280px] md:aspect-3/1 lg:max-h-[320px] lg:aspect-4/1";

function SlideImages({
  banner,
  slideIndex,
}: {
  banner: MarketingBannerRow;
  slideIndex: number;
}) {
  const { mobileSrc, tabletSrc, desktopSrc } = resolveSlideImages(banner);
  const first = slideIndex === 0;

  return (
    <>
      <div className="absolute inset-0 md:hidden" aria-hidden>
        <Image
          src={mobileSrc}
          alt=""
          fill
          priority={first}
          sizes="(max-width: 768px) 100vw, 0"
          className="object-cover object-top"
        />
      </div>
      <div className="absolute inset-0 hidden md:block lg:hidden" aria-hidden>
        <Image
          src={tabletSrc}
          alt=""
          fill
          priority={first}
          sizes="(max-width: 1024px) 100vw, 0"
          className="object-cover object-top"
        />
      </div>
      <div className="absolute inset-0 hidden lg:block" aria-hidden>
        <Image
          src={desktopSrc}
          alt=""
          fill
          priority={first}
          sizes="(max-width: 1280px) 100vw, 1280px"
          className="object-cover object-top"
        />
      </div>
    </>
  );
}

function BannerLink({
  banner,
  children,
}: {
  banner: MarketingBannerRow;
  children: React.ReactNode;
}) {
  const commonProps = {
    className: linkFrameClass,
    "aria-label": slideAlt(banner),
  };

  if (banner.href.startsWith("#") && banner.href.length > 1) {
    return (
      <SmoothScrollLink {...commonProps} targetId={banner.href.slice(1)}>
        {children}
      </SmoothScrollLink>
    );
  }

  return (
    <Link
      {...commonProps}
      href={banner.href}
      prefetch={false}
      {...(banner.openInNewTab
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {children}
    </Link>
  );
}

export default function MarketingBannerCarousel({ banners }: Props) {
  const plugin = useRef(
    Autoplay({ delay: 5500, stopOnInteraction: true, stopOnMouseEnter: true }),
  );

  if (banners.length === 0) {
    return null;
  }

  return (
    <Carousel
      plugins={[plugin.current]}
      opts={{ loop: banners.length > 1 }}
      className="w-full"
    >
      <CarouselContent className="ml-0">
        {banners.map((banner, slideIndex) => (
          <CarouselItem key={banner.id} className="pl-0">
            <BannerLink banner={banner}>
              <SlideImages banner={banner} slideIndex={slideIndex} />
            </BannerLink>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
