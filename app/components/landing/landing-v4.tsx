import { ArrowRightIcon, ArrowUpRightIcon, MapPinIcon } from "lucide-react";
import {
  faFacebook,
  faInstagram,
  faTiktok,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Image from "next/image";
import Link from "next/link";

import MarketingBannerCarousel from "@/app/components/marketing/marketing-banner-carousel";
import PreviewLandingBar from "@/app/components/landing/preview-landing-bar";
import { Button } from "@/app/components/ui/button";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { formatDate } from "@/app/lib/formatters";
import {
  getCommunityGalleryLayout,
  getImageObjectPosition,
  getImageZoom,
} from "@/app/lib/landing_content/gallery-layout";
import type { MarketingBannerRow } from "@/app/lib/marketing_banners/definitions";
import type {
  LandingPageContentV1,
  LandingSectionBackground,
  LandingSectionKey,
} from "@/app/lib/landing_content/definitions";
import type { ResolvedFestival } from "@/app/lib/landing_content/resolve";

type Props = {
  content: LandingPageContentV1;
  marketingBanners: MarketingBannerRow[];
  spotlight: ResolvedFestival | null;
  family: Array<
    LandingPageContentV1["sections"]["festivalFamily"]["items"][number] & {
      occurrence: ResolvedFestival | null;
    }
  >;
  preview?: boolean;
};

const AUTO_SECTION_BACKGROUNDS: Exclude<LandingSectionBackground, "default">[] =
  ["purple", "none", "coral", "none"];

const sectionBackgroundClasses: Record<
  Exclude<LandingSectionBackground, "default">,
  string
> = {
  none: "bg-brand-elevated",
  purple: "bg-brand-lavender",
  coral: "bg-brand-coral-soft",
};

function Heading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`font-display text-3xl font-extrabold leading-tight tracking-[-0.5px] text-brand-ink sm:text-4xl lg:text-5xl ${className}`}
    >
      {children}
    </h2>
  );
}

const festivalSpotlightFallbacks: Record<
  ResolvedFestival["festivalType"],
  string
> = {
  glitter:
    "Arte, ilustración y oficios creativos en un encuentro hecho para descubrir talento boliviano.",
  festicker:
    "Stickers, personajes y cultura urbana se encuentran en una celebración que toma la ciudad.",
  twinkler:
    "Historias, personajes y mundos encantados para despertar la imaginación en comunidad.",
};

function getFestivalDateStamp(festival: ResolvedFestival) {
  const first = festival.festivalDates[0]?.startDate;
  const last = festival.festivalDates.at(-1)?.startDate;
  if (!first || !last) return null;

  const start = formatDate(first);
  const end = formatDate(last);
  const sameDay = start.hasSame(end, "day");
  const sameMonth = start.hasSame(end, "month");
  const month = (date: typeof start) =>
    date.toFormat("LLL").replace(".", "").toUpperCase();

  return {
    primary: sameDay
      ? start.toFormat("d")
      : `${start.toFormat("d")}–${end.toFormat("d")}`,
    secondary: sameMonth ? month(end) : `${month(start)}–${month(end)}`,
    year: end.toFormat("yyyy"),
    dateTime: start.toISODate() ?? undefined,
  };
}

function DestinationArrow({ href }: { href: string }) {
  const Icon = href.startsWith("#") ? ArrowRightIcon : ArrowUpRightIcon;
  return <Icon aria-hidden="true" className="size-4" />;
}

function Hero({
  value,
  eventHref,
}: {
  value: LandingPageContentV1["hero"];
  eventHref: string;
}) {
  const href =
    value.primaryCta.href === "/festivals/festicker"
      ? eventHref
      : value.primaryCta.href;
  return (
    <section
      id="inicio"
      className="relative isolate scroll-mt-20 overflow-hidden bg-brand-elevated"
    >
      <div className="relative mx-auto min-h-[730px] max-w-[1440px] overflow-hidden px-5 pb-[380px] pt-12 sm:min-h-[760px] sm:px-8 sm:pb-[400px] sm:pt-16 md:min-h-[800px] md:px-10 md:pb-[400px] lg:grid lg:min-h-[620px] lg:grid-cols-[minmax(0,1.08fr)_minmax(400px,0.92fr)] lg:items-center lg:gap-6 lg:px-20 lg:py-20">
        <div className="relative z-20 max-w-2xl lg:max-w-none lg:py-10">
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-[-1.5px] text-brand-ink sm:text-6xl lg:text-[60px]">
            {value.titleLead}{" "}
            <span className="text-brand-primary">{value.titleAccent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-brand-neutral sm:text-lg">
            {value.body}
          </p>
          {value.primaryCta.show || value.secondaryCta.show ? (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {value.primaryCta.show ? (
                <Button asChild size="lg" variant="cta">
                  <Link href={href}>{value.primaryCta.label}</Link>
                </Button>
              ) : null}
              {value.secondaryCta.show ? (
                <Link
                  href={value.secondaryCta.href}
                  className="inline-flex items-center gap-1 font-semibold text-brand-primary underline-offset-4 hover:underline"
                >
                  {value.secondaryCta.label}
                  <DestinationArrow href={value.secondaryCta.href} />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="pointer-events-none absolute bottom-[28px] left-[5%] right-[-24%] h-[345px] sm:bottom-[16px] sm:left-[20%] sm:right-[-14%] sm:h-[400px] md:bottom-[12px] md:left-[30%] md:right-[-4%] md:top-auto md:h-[360px] lg:relative lg:inset-auto lg:h-[520px] lg:w-full">
          <div
            aria-hidden="true"
            className="absolute bottom-[10%] left-[7%] right-[-4%] top-[11%] rotate-[-2deg] overflow-hidden rounded-[32px] border-2 border-brand-ink/10 bg-[#FFD633] shadow-[0_22px_60px_rgba(98,0,203,0.14)]"
          >
            <span className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-brand-elevated" />
            <span className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-brand-elevated" />
            <span className="absolute bottom-[16%] left-[12%] top-[16%] border-l-2 border-dashed border-brand-ink/15" />
          </div>

          <Image
            src={value.image.url}
            alt={value.image.alt}
            fill
            priority
            sizes="(max-width: 639px) 120vw, (max-width: 1023px) 68vw, 620px"
            className="z-10 object-contain object-bottom drop-shadow-[0_18px_24px_rgba(41,0,92,0.16)]"
          />
        </div>
      </div>
    </section>
  );
}

function Event({
  value,
  festival,
  backgroundClass,
}: {
  value: LandingPageContentV1["sections"]["eventSpotlight"];
  festival: ResolvedFestival | null;
  backgroundClass: string;
}) {
  if (!festival) return null;
  const art =
    festival.posterUrl ?? festival.festivalBannerUrl ?? festival.thumbnailUrl;
  const href = `/festivals/${festival.id}`;
  const register =
    festival.publicRegistration && festival.status === "active"
      ? `${href}/registration`
      : href;
  const resolveCtaHref = (
    cta: LandingPageContentV1["sections"]["eventSpotlight"]["primaryCta"],
  ) => {
    if (cta.destination === "festival") return href;
    if (cta.destination === "registration") return register;
    return cta.href;
  };
  const location =
    [festival.locationLabel, festival.address].filter(Boolean).join(" · ") ||
    "Ubicación por confirmar";
  const dateLabel = festival.festivalDates.length
    ? getFestivalDateLabel(festival)
    : "Fecha por confirmar";
  const dateStamp = getFestivalDateStamp(festival);
  const description =
    festival.description?.trim() ||
    festivalSpotlightFallbacks[festival.festivalType];
  return (
    <section id="proximo-evento" className={`scroll-mt-20 ${backgroundClass}`}>
      <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 lg:px-20 lg:py-20">
        <article
          className={`relative mx-auto overflow-hidden rounded-[28px] border border-brand-ink/10 bg-brand-card shadow-[0_24px_70px_rgba(41,0,92,0.12)] ${
            art
              ? "grid md:grid-cols-[minmax(240px,0.82fr)_1px_minmax(0,1.18fr)]"
              : "max-w-4xl"
          }`}
        >
          {art ? (
            <div className="relative isolate flex items-center bg-brand-ink px-5 py-6 sm:px-8 sm:py-8 md:px-6 lg:px-8 lg:py-10">
              <div className="relative mx-auto aspect-3/4 w-full max-w-[360px] overflow-hidden rounded-[16px] shadow-[0_18px_42px_rgba(0,0,0,0.24)]">
                <Image
                  src={art}
                  alt={`Afiche de ${festival.name}`}
                  fill
                  sizes="(max-width: 767px) 80vw, (max-width: 1023px) 34vw, 360px"
                  className="object-cover"
                />
              </div>
            </div>
          ) : null}

          {art ? (
            <div
              aria-hidden="true"
              className="border-t-2 border-dashed border-brand-primary/25 md:border-l-2 md:border-t-0"
            />
          ) : null}

          <div className="flex max-w-3xl flex-col justify-center p-6 sm:p-8 md:p-9 lg:p-14">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-primary sm:text-sm">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-brand-coral"
              />
              Próximo festival
            </p>
            <Heading className="mt-3">{festival.name}</Heading>

            <p className="mt-4 max-w-2xl text-base leading-7 text-brand-neutral sm:text-lg">
              {description}
            </p>

            <div className="mt-7 grid items-stretch gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              {dateStamp ? (
                <time
                  dateTime={dateStamp.dateTime}
                  aria-label={dateLabel}
                  className="grid min-w-28 place-items-center rounded-[18px] bg-brand-ink px-5 py-4 text-center font-display text-white"
                >
                  <span className="text-3xl font-extrabold leading-none tracking-[-1px] sm:text-4xl">
                    {dateStamp.primary}
                  </span>
                  <span className="mt-1 text-sm font-bold tracking-[0.16em]">
                    {dateStamp.secondary}
                  </span>
                  <span className="mt-0.5 text-xs text-white/70">
                    {dateStamp.year}
                  </span>
                </time>
              ) : (
                <div className="flex min-h-28 min-w-28 items-center justify-center rounded-[18px] bg-brand-ink px-5 py-4 text-center font-display font-bold text-white">
                  Fecha por confirmar
                </div>
              )}

              <div className="flex min-h-28 items-center rounded-[18px] border border-brand-border bg-brand-lavender/45">
                {festival.locationUrl ? (
                  <a
                    href={festival.locationUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir ${location} en Maps`}
                    className="flex min-h-28 w-full items-center gap-3 rounded-[18px] px-5 py-4 transition-colors hover:bg-brand-lavender/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  >
                    <MapPinIcon className="size-5 shrink-0 text-brand-primary" />
                    <span className="font-display text-lg font-bold leading-6 text-brand-ink sm:text-xl">
                      {location}
                    </span>
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="ml-auto size-4 shrink-0 text-brand-primary"
                    />
                  </a>
                ) : (
                  <p className="flex items-start gap-3 font-display text-lg font-bold leading-6 text-brand-ink sm:text-xl">
                    <MapPinIcon className="mt-0.5 size-5 shrink-0 text-brand-primary" />
                    <span>{location}</span>
                  </p>
                )}
              </div>
            </div>

            {value.primaryCta.show || value.secondaryCta.show ? (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {value.primaryCta.show && resolveCtaHref(value.primaryCta) ? (
                  <Button
                    asChild
                    size="lg"
                    variant="cta"
                    className="w-full gap-2 sm:w-fit"
                  >
                    <Link href={resolveCtaHref(value.primaryCta)!}>
                      {value.primaryCta.label}
                      <DestinationArrow
                        href={resolveCtaHref(value.primaryCta)!}
                      />
                    </Link>
                  </Button>
                ) : null}
                {value.secondaryCta.show &&
                resolveCtaHref(value.secondaryCta) ? (
                  <Link
                    href={resolveCtaHref(value.secondaryCta)!}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3 text-sm font-bold text-brand-primary transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-lavender/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary motion-reduce:transform-none sm:w-fit"
                  >
                    {value.secondaryCta.label}
                    <DestinationArrow
                      href={resolveCtaHref(value.secondaryCta)!}
                    />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}

function Audience({
  value,
  backgroundClass,
}: {
  value: LandingPageContentV1["sections"]["audience"];
  backgroundClass: string;
}) {
  return (
    <section id="participa" className={`scroll-mt-20 ${backgroundClass}`}>
      <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 lg:px-20 lg:py-20">
        <Heading className="text-center">{value.heading}</Heading>
        <div className="mt-10 grid gap-4 md:grid-cols-3 lg:mt-12">
          {value.items.map((card) => (
            <article
              key={card.id}
              className="flex h-full flex-col rounded-[20px] border border-brand-border bg-white p-6"
            >
              <div className="relative h-44 w-full overflow-hidden sm:h-50">
                <Image
                  src={card.image.url}
                  alt={card.image.alt}
                  fill
                  sizes="(max-width: 768px) 88vw, 368px"
                  className={card.featured ? "object-cover" : "object-contain"}
                />
              </div>
              <h3 className="mt-4 font-display text-xl font-bold text-brand-ink">
                {card.title}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-5 text-brand-neutral">
                {card.description}
              </p>
              {card.cta.show ? (
                <Link
                  href={card.cta.href}
                  className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand-coral underline-offset-4 hover:underline"
                >
                  {card.cta.label}
                  <DestinationArrow href={card.cta.href} />
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Family({
  value,
  family,
  backgroundClass,
}: {
  value: LandingPageContentV1["sections"]["festivalFamily"];
  family: Props["family"];
  backgroundClass: string;
}) {
  const festivalOrder = { glitter: 0, festicker: 1, twinkler: 2 } as const;
  const orderedFamily = [...family].sort(
    (a, b) => festivalOrder[a.festivalType] - festivalOrder[b.festivalType],
  );
  const styles = {
    glitter: {
      panel:
        "bg-[#4A0F93] text-white shadow-[0_28px_80px_rgba(74,15,147,0.2)] lg:min-h-[620px]",
      copy: "min-[700px]:col-span-5 min-[700px]:pr-2 lg:pr-4",
      visual:
        "min-[700px]:col-span-7 min-[700px]:min-h-[440px] lg:min-h-[540px]",
      logo: "/img/logo/glitter-logo-full-white-1696x741.png",
      logoWidth: 1696,
      logoHeight: 741,
      logoClassName: "h-auto w-[250px] sm:w-[300px]",
      imageFrame:
        "inset-y-[-8%] left-[4%] right-[4%] overflow-visible sm:inset-y-[-10%] min-[700px]:right-[2%] md:inset-y-[-4%] lg:left-[6%]",
      imageClassName:
        "object-contain drop-shadow-[0_22px_26px_rgba(24,4,55,0.3)]",
      description: "text-white/80",
      cta: "bg-[#FFDF3C] text-[#29005C] hover:bg-white",
      ornament: "",
      ctaLabel: "Descubrí Glitter",
    },
    twinkler: {
      panel:
        "bg-[#172F31] text-white shadow-[0_28px_80px_rgba(23,47,49,0.18)] lg:min-h-[520px]",
      copy: "min-[700px]:order-2 min-[700px]:col-span-5 min-[700px]:pl-2 lg:pl-6",
      visual:
        "min-[700px]:order-1 min-[700px]:col-span-7 min-[700px]:min-h-[380px] lg:min-h-[440px]",
      logo: "/img/twinkler/twinkler-v3-title.png",
      logoWidth: 382,
      logoHeight: 82,
      logoClassName: "h-auto w-[210px] sm:w-[250px]",
      imageFrame:
        "-bottom-[8%] -left-[8%] -right-[8%] -top-[8%] overflow-visible min-[700px]:bottom-[4%] min-[700px]:left-[-5%] min-[700px]:right-[7%] min-[700px]:top-[4%] min-[700px]:rounded-[45%_55%_48%_52%/58%_42%_58%_42%] min-[700px]:border-2 min-[700px]:border-[#F6C455]/70 lg:right-[4%]",
      imageClassName: "object-contain min-[700px]:p-3 lg:p-5",
      description: "text-[#D7E9DD]",
      cta: "bg-[#F6C455] text-[#172F31] hover:bg-white",
      ornament: "",
      ctaLabel: "Entrá a Twinkler",
    },
    festicker: {
      panel:
        "bg-[#11CFC4] text-[#22114F] shadow-[0_28px_80px_rgba(17,207,196,0.16)] lg:min-h-[520px]",
      copy: "min-[700px]:col-span-5 min-[700px]:pr-2 lg:pr-4",
      visual:
        "min-h-[360px] min-[700px]:col-span-7 min-[700px]:min-h-[400px] lg:min-h-[480px]",
      logo: "/img/glitter/festicker-v2-logo-382x160.png",
      logoWidth: 382,
      logoHeight: 160,
      logoClassName: "h-auto w-[220px] sm:w-[270px]",
      imageFrame:
        "top-0 bottom-[-8%] left-[-2%] right-[-5%] overflow-visible min-[700px]:top-[-11%] min-[700px]:bottom-[-11%] min-[700px]:left-[7%] lg:top-[-13%] lg:bottom-[-13%]",
      imageClassName:
        "object-contain drop-shadow-[0_24px_30px_rgba(34,17,79,0.24)]",
      description: "text-[#22114F]/75",
      cta: "bg-[#22114F] text-white hover:bg-[#FF3D9A]",
      ornament: "",
      ctaLabel: "Pegate a Festicker",
    },
  } satisfies Record<
    LandingPageContentV1["sections"]["festivalFamily"]["items"][number]["festivalType"],
    {
      panel: string;
      copy: string;
      visual: string;
      logo: string;
      logoWidth: number;
      logoHeight: number;
      logoClassName: string;
      imageFrame: string;
      imageClassName: string;
      description: string;
      cta: string;
      ornament: string;
      ctaLabel: string;
    }
  >;

  return (
    <section id="festivales" className={`scroll-mt-20 ${backgroundClass}`}>
      <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 lg:px-20 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Heading>{value.heading}</Heading>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-brand-neutral sm:text-lg">
            {value.body}
          </p>
        </div>
        <div className="mt-10 space-y-6 lg:mt-14 lg:space-y-8">
          {orderedFamily.map((card) => {
            const theme = styles[card.festivalType];
            const href =
              card.href ??
              (card.occurrence ? `/festivals/${card.occurrence.id}` : null);

            return (
              <article
                key={card.id}
                className={`group/world relative isolate grid overflow-hidden rounded-[30px] px-6 py-8 sm:px-10 sm:py-10 min-[700px]:grid-cols-12 min-[700px]:items-center min-[700px]:gap-6 lg:gap-8 lg:px-14 lg:py-10 ${theme.panel} ${theme.ornament}`}
              >
                <div className={`relative z-20 ${theme.copy}`}>
                  <Image
                    src={theme.logo}
                    alt={card.displayName}
                    width={theme.logoWidth}
                    height={theme.logoHeight}
                    className={theme.logoClassName}
                  />
                  <p
                    className={`mt-5 max-w-md text-lg leading-7 sm:text-xl sm:leading-8 ${theme.description}`}
                  >
                    {card.description}
                  </p>
                  {card.showCta && href ? (
                    <Link
                      href={href}
                      className={`mt-7 inline-flex min-h-12 items-center gap-1 rounded-full px-6 py-3 text-sm font-bold transition-[background-color,transform] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current motion-reduce:transform-none ${theme.cta}`}
                    >
                      {theme.ctaLabel}
                      <ArrowUpRightIcon className="size-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>

                <div
                  className={`relative z-10 mt-8 h-[320px] sm:h-[380px] min-[700px]:mt-0 min-[700px]:h-auto ${theme.visual}`}
                >
                  {card.festivalType === "glitter" ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                    >
                      <div className="absolute inset-[7%_0_3%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(137,79,207,0.7)_0%,rgba(116,56,189,0.38)_48%,rgba(74,15,147,0)_72%)]" />
                      <div className="absolute right-[7%] top-[9%] size-7 rotate-12 bg-[#FFDF3C] drop-shadow-[0_7px_14px_rgba(25,4,56,0.22)] [clip-path:polygon(50%_0%,58%_42%,100%_50%,58%_58%,50%_100%,42%_58%,0%_50%,42%_42%)] sm:size-8 min-[700px]:right-0 min-[700px]:top-[4%] lg:right-[7%] lg:top-[9%]" />
                      <div className="absolute bottom-[9%] left-[9%] size-4 -rotate-12 bg-[#FF7584] drop-shadow-[0_5px_10px_rgba(25,4,56,0.2)] [clip-path:polygon(50%_0%,58%_42%,100%_50%,58%_58%,50%_100%,42%_58%,0%_50%,42%_42%)] sm:size-5" />
                    </div>
                  ) : null}
                  {card.festivalType === "festicker" ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                    >
                      <div className="absolute inset-[3%_-2%_0_0] rounded-[48%] bg-[radial-gradient(ellipse_at_center,rgba(255,61,154,0.38)_0%,rgba(255,225,74,0.12)_40%,rgba(17,207,196,0)_72%)]" />
                      <div className="absolute right-[1%] top-[3%] size-28 opacity-30 [background-image:radial-gradient(#22114F_1.5px,transparent_1.5px)] [background-size:11px_11px] [mask-image:radial-gradient(circle_at_center,#000_18%,transparent_72%)] sm:size-32 min-[700px]:right-0 min-[700px]:top-[5%] lg:size-36" />
                    </div>
                  ) : null}
                  <div
                    className={`absolute z-10 transition-transform duration-700 ease-out group-hover/world:scale-[1.015] motion-reduce:transition-none ${theme.imageFrame}`}
                  >
                    <Image
                      src={card.fallbackImage.url}
                      alt={card.fallbackImage.alt}
                      fill
                      sizes="(max-width: 768px) 92vw, 720px"
                      className={theme.imageClassName}
                      style={{
                        objectPosition: getImageObjectPosition(
                          card.fallbackImage.focalPoint,
                        ),
                        transform: `scale(${getImageZoom(card.fallbackImage.zoom)})`,
                        transformOrigin: getImageObjectPosition(
                          card.fallbackImage.focalPoint,
                        ),
                      }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Community({
  value,
  backgroundClass,
}: {
  value: LandingPageContentV1["sections"]["community"];
  backgroundClass: string;
}) {
  return (
    <section
      id="comunidad"
      className={`scroll-mt-20 border-y border-brand-border ${backgroundClass}`}
    >
      <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 lg:px-20 lg:py-20">
        <Heading>{value.heading}</Heading>
        <p className="mt-3 text-brand-neutral">{value.body}</p>
        <div className="mt-8 grid grid-cols-2 items-start gap-3 md:grid-cols-12 lg:gap-4">
          {value.gallery.map(({ id, image }, index) => {
            const layout = getCommunityGalleryLayout(index);
            return (
              <figure
                key={id}
                className={`group relative overflow-hidden rounded-2xl bg-brand-lavender ${layout.frame}`}
              >
                <Image
                  src={image.url}
                  alt={image.alt}
                  fill
                  sizes={layout.sizes}
                  className="object-cover transition-transform duration-300 ease-out"
                  style={{
                    objectPosition: getImageObjectPosition(image.focalPoint),
                    transform: `scale(${getImageZoom(image.zoom)})`,
                    transformOrigin: getImageObjectPosition(image.focalPoint),
                  }}
                />
              </figure>
            );
          })}
        </div>
        {value.testimonials.length ? (
          <>
            <h3 className="mt-8 font-display text-2xl font-bold text-brand-primary">
              {value.testimonialHeading}
            </h3>
            <div className="mt-5 grid gap-6 md:grid-cols-3">
              {value.testimonials.map((item) => (
                <figure
                  key={item.id}
                  className="flex h-full flex-col justify-between rounded-[20px] border border-brand-border bg-white p-6"
                >
                  <blockquote className="text-sm leading-5 text-brand-neutral">
                    “{item.quote}”
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    <Image
                      src={item.image.url}
                      alt={item.image.alt}
                      width={48}
                      height={48}
                      className="size-12 rounded-full"
                    />
                    <span>
                      <strong className="block font-display text-xl font-bold text-brand-neutral-strong">
                        {item.name}
                      </strong>
                      <span className="block text-xs text-brand-primary">
                        {item.role}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function Partners({
  value,
  backgroundClass,
}: {
  value: LandingPageContentV1["sections"]["partners"];
  backgroundClass: string;
}) {
  const cta = value.sponsorCta;
  return (
    <div className={backgroundClass}>
      <section className="px-5 py-12 text-center sm:px-8 lg:px-20 lg:py-16">
        <p className="font-display text-sm font-bold uppercase tracking-[0.08em] text-brand-neutral sm:text-base lg:text-xl">
          {value.heading}
        </p>
        <div className="mx-auto mt-8 flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4 font-display text-lg font-bold text-brand-ink sm:text-xl lg:gap-x-16 lg:text-2xl">
          {value.items.map((item) => {
            const content = item.image ? (
              <Image
                src={item.image.url}
                alt={item.name}
                fill
                sizes="144px"
                className="object-contain"
              />
            ) : (
              <span>{item.name}</span>
            );
            const className = item.image
              ? "relative flex h-14 w-36 items-center justify-center"
              : undefined;
            return item.href ? (
              <a key={item.id} href={item.href} className={className}>
                {content}
              </a>
            ) : (
              <span key={item.id} className={className}>
                {content}
              </span>
            );
          })}
        </div>
      </section>
      <section
        id="alianzas"
        className="scroll-mt-20 border-y border-brand-border"
      >
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 py-14 sm:px-8 md:grid-cols-[280px_1fr] lg:gap-16 lg:px-0 lg:py-20">
          <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-full bg-brand-lavender lg:max-w-[320px]">
            <Image
              src={cta.image.url}
              alt={cta.image.alt}
              fill
              sizes="320px"
              className="scale-[0.88] object-contain"
            />
          </div>
          <div>
            <Heading>{cta.heading}</Heading>
            <p className="mt-5 max-w-3xl leading-6 text-brand-neutral">
              {cta.body}
            </p>
            <div className="mt-6 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs text-brand-neutral">{cta.emailLabel}</p>
                <a
                  href={`mailto:${cta.email}`}
                  className="font-display text-lg font-bold text-brand-ink underline-offset-4 hover:underline sm:text-xl"
                >
                  {cta.email}
                </a>
              </div>
              {cta.showButton ? (
                <Button asChild size="lg" variant="cta">
                  <a
                    href={`mailto:${cta.email}?subject=${encodeURIComponent(cta.emailSubject)}`}
                  >
                    {cta.buttonLabel}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FooterList({
  title,
  links,
}: {
  title: string;
  links: LandingPageContentV1["footer"]["festivalLinks"];
}) {
  return (
    <div>
      <h3 className="font-display text-xl font-bold text-brand-ink">{title}</h3>
      <ul className="mt-3 space-y-3 text-sm text-brand-neutral">
        {links.map((link) => (
          <li key={`${link.label}-${link.href}`}>
            <Link href={link.href} className="hover:text-brand-primary">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer({ value }: { value: LandingPageContentV1["footer"] }) {
  const icon = (network: string) =>
    network === "facebook"
      ? faFacebook
      : network === "instagram"
        ? faInstagram
        : network === "tiktok"
          ? faTiktok
          : null;
  return (
    <footer className="bg-brand-elevated px-5 pb-10 pt-14 sm:px-8 lg:px-20 lg:pt-20">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-16">
          <div className="max-w-sm">
            <Image
              src={value.logo.url}
              alt={value.logo.alt}
              width={140}
              height={50}
              className="h-auto w-[140px] object-contain"
            />
            <p className="mt-4 text-sm leading-5 text-brand-neutral">
              {value.description}
            </p>
          </div>
          <FooterList title="Festivales" links={value.festivalLinks} />
          <FooterList title="Comunidad" links={value.communityLinks} />
          <div>
            <h3 className="font-display text-xl font-bold text-brand-ink">
              Contacto
            </h3>
            <ul className="mt-3 space-y-3 text-sm text-brand-neutral">
              <li>
                <a href={`mailto:${value.contactEmail}`}>
                  {value.contactEmail}
                </a>
              </li>
              <li>{value.location}</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-5 border-t border-brand-border pt-6 text-sm text-brand-neutral sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {value.copyrightText}
          </p>
          <div className="flex items-center gap-4">
            {value.socialLinks.map((social) => {
              const socialIcon = icon(social.network);

              return (
                <a
                  key={social.id}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                >
                  {socialIcon ? (
                    <FontAwesomeIcon
                      icon={socialIcon}
                      aria-hidden="true"
                      className="size-5"
                    />
                  ) : (
                    social.label
                  )}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingV4({
  content,
  marketingBanners,
  spotlight,
  family,
  preview = false,
}: Props) {
  const visibleSections = content.sectionOrder.filter((section) => {
    if (section === "marketing_banners") {
      return (
        content.sections.marketingBanners.enabled && marketingBanners.length > 0
      );
    }
    if (section === "event_spotlight") {
      return content.sections.eventSpotlight.enabled && spotlight !== null;
    }
    if (section === "audience") return content.sections.audience.enabled;
    if (section === "festival_family") {
      return content.sections.festivalFamily.enabled;
    }
    if (section === "community") return content.sections.community.enabled;
    return content.sections.partners.enabled;
  });
  const getSectionBackgroundClass = (section: LandingSectionKey) => {
    const configured = content.sectionBackgrounds[section];
    const automaticIndex = Math.max(0, visibleSections.indexOf(section));
    const background =
      configured === "default"
        ? (AUTO_SECTION_BACKGROUNDS[
            automaticIndex % AUTO_SECTION_BACKGROUNDS.length
          ] ?? "none")
        : configured;

    return sectionBackgroundClasses[background];
  };
  const sections: Record<
    LandingPageContentV1["sectionOrder"][number],
    React.ReactNode
  > = {
    marketing_banners:
      content.sections.marketingBanners.enabled && marketingBanners.length ? (
        <section
          className={`${getSectionBackgroundClass("marketing_banners")} px-5 pb-8 sm:px-8 lg:px-20`}
        >
          <div className="mx-auto max-w-[1280px] overflow-hidden rounded-[20px]">
            <MarketingBannerCarousel banners={marketingBanners} />
          </div>
        </section>
      ) : null,
    event_spotlight:
      content.sections.eventSpotlight.enabled && spotlight ? (
        <Event
          value={content.sections.eventSpotlight}
          festival={spotlight}
          backgroundClass={getSectionBackgroundClass("event_spotlight")}
        />
      ) : null,
    audience: content.sections.audience.enabled ? (
      <Audience
        value={content.sections.audience}
        backgroundClass={getSectionBackgroundClass("audience")}
      />
    ) : null,
    festival_family: content.sections.festivalFamily.enabled ? (
      <Family
        value={content.sections.festivalFamily}
        family={family}
        backgroundClass={getSectionBackgroundClass("festival_family")}
      />
    ) : null,
    community: content.sections.community.enabled ? (
      <Community
        value={content.sections.community}
        backgroundClass={getSectionBackgroundClass("community")}
      />
    ) : null,
    partners: content.sections.partners.enabled ? (
      <Partners
        value={content.sections.partners}
        backgroundClass={getSectionBackgroundClass("partners")}
      />
    ) : null,
  };
  return (
    <div className="bg-[#FFFDF9] text-brand-neutral-strong">
      {preview ? (
        <PreviewLandingBar announcement={content.announcement} />
      ) : null}
      <Hero
        value={content.hero}
        eventHref={
          spotlight ? `/festivals/${spotlight.id}` : "/festivals/festicker"
        }
      />
      {content.sectionOrder.map((key) => (
        <div key={key}>{sections[key]}</div>
      ))}
      <Footer value={content.footer} />
    </div>
  );
}
