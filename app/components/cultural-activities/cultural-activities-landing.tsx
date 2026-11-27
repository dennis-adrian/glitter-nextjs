import Link from "next/link";

import { ArrowRightIcon } from "lucide-react";

import CulturalActivitiesFaq from "@/app/components/cultural-activities/cultural-activities-faq";
import CulturalActivityCategoryIcon from "@/app/components/cultural-activities/category-icon";
import { buttonVariants } from "@/app/components/ui/button";
import {
  CULTURAL_ACTIVITY_APPLY_PATH,
  CULTURAL_ACTIVITY_CATEGORIES,
  CULTURAL_ACTIVITY_CATEGORY_CONFIG,
  CULTURAL_ACTIVITY_COPY,
  culturalActivityApplyHref,
  type LiveActCategory,
} from "@/app/lib/live_acts/definitions";
import { cn } from "@/app/lib/utils";

const CONTAINER = "mx-auto max-w-7xl px-5 md:px-10 lg:px-20";
const copy = CULTURAL_ACTIVITY_COPY;

/** /actividades-culturales: static, no database. */
export default function CulturalActivitiesLanding() {
  return (
    <div className="bg-brand-elevated text-brand-ink">
      <Hero />
      <HowItWorks />
      <Categories />
      <CallToAction />
      <CulturalActivitiesFaq />
    </div>
  );
}

function Hero() {
  return (
    <section className={cn(CONTAINER, "py-12 md:py-20")}>
      <h1
        data-installed-title=""
        className="font-display text-[44px] leading-[0.95] font-extrabold tracking-[-1.5px] break-words text-brand-ink md:text-6xl"
      >
        {copy.heroTitleLead}{" "}
        <span className="text-brand-primary">{copy.heroTitleAccent}</span>
      </h1>
      <p className="mt-4 font-display text-2xl leading-tight font-bold text-brand-ink md:mt-5 md:text-[30px]">
        {copy.heroSubhead}
      </p>
      <p className="mt-5 max-w-xl text-[17px] leading-7 text-brand-neutral md:mt-6 md:text-lg">
        {copy.heroLead}
      </p>
      <div className="mt-8 flex flex-col items-stretch gap-4 md:flex-row md:items-center md:gap-6">
        <Link
          href={CULTURAL_ACTIVITY_APPLY_PATH}
          className={buttonVariants({
            variant: "cta",
            size: "lg",
            wrap: true,
            className: "w-full md:w-auto",
          })}
        >
          {copy.applyCta}
        </Link>
        <a
          href="#categorias"
          className="inline-flex min-h-11 items-center justify-center font-semibold text-brand-primary hover:underline md:justify-start"
        >
          {copy.seeCategories} →
        </a>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className={cn(CONTAINER, "pb-14 md:pb-20")}>
      <div className="flex flex-col gap-6 border-t border-brand-border pt-10 md:flex-row md:gap-10 md:pt-12">
        <h2 className="font-display text-[28px] leading-tight font-extrabold text-brand-ink md:w-[240px] md:flex-none">
          {copy.howTitle}
        </h2>
        <ol className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-6 md:gap-8">
          {copy.howSteps.map((step, index) => (
            <li
              key={step.title}
              className="grid min-w-0 grid-cols-[40px_1fr] gap-x-3 md:block"
            >
              <span
                className="font-display text-[36px] leading-none font-extrabold text-brand-primary md:text-[44px]"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0 md:mt-3">
                <h3 className="text-base font-bold break-words text-brand-ink">
                  <span className="sr-only">Paso {index + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-[22px] break-words text-brand-neutral">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Categories() {
  const grid = CULTURAL_ACTIVITY_CATEGORIES.filter(
    (category) => category !== "other",
  );
  return (
    <section id="categorias" className="scroll-mt-20 bg-brand-lavender">
      <div className={cn(CONTAINER, "py-14 md:py-20")}>
        <h2 className="font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.5px] text-brand-ink md:text-[44px]">
          {copy.categoriesTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-brand-neutral md:text-lg">
          {copy.categoriesLead}
        </p>
        <ul className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
          {grid.map((category) => (
            <li key={category} className="flex min-w-0">
              <CategoryCard category={category} />
            </li>
          ))}
          <li className="col-span-full flex min-w-0">
            <CategoryCard category="other" />
          </li>
        </ul>
      </div>
    </section>
  );
}

function CategoryCard({ category }: { category: LiveActCategory }) {
  const config = CULTURAL_ACTIVITY_CATEGORY_CONFIG[category];
  return (
    <article className="flex w-full min-w-0 flex-col rounded-[20px] border border-brand-border bg-brand-card p-5">
      <div className="flex items-center gap-4">
        <span className="flex size-12 flex-none items-center justify-center rounded-[14px] bg-brand-deep text-white md:size-14 md:rounded-2xl">
          <CulturalActivityCategoryIcon
            category={category}
            className="size-[22px] md:size-6"
          />
        </span>
        <h3 className="min-w-0 font-display text-xl font-bold break-words text-brand-ink">
          {config.title}
        </h3>
      </div>
      <p className="mt-3.5 text-sm leading-[22px] break-words text-brand-neutral">
        {config.explanation}
      </p>
      <div className="mt-3.5">
        <p className="text-[13px] font-semibold text-brand-ink">
          {copy.youWillNeed}
        </p>
        <p className="mt-0.5 text-sm leading-[22px] break-words text-brand-neutral-strong">
          {config.needs}
        </p>
      </div>
      <Link
        href={culturalActivityApplyHref(category)}
        className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start pt-3 font-semibold text-brand-primary hover:underline"
      >
        {config.linkLabel}
        <ArrowRightIcon className="size-4 flex-none" aria-hidden />
      </Link>
    </article>
  );
}

function CallToAction() {
  return (
    <section className="bg-brand-deep text-white">
      <div className={cn(CONTAINER, "pt-14 pb-8 md:pt-[72px]")}>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.5px] break-words text-white md:text-[44px]">
              {copy.bandTitle}
            </h2>
            <p className="mt-3 text-base leading-7 text-white/85 md:text-lg">
              {copy.bandText}
            </p>
          </div>
          <Link
            href={CULTURAL_ACTIVITY_APPLY_PATH}
            className={buttonVariants({
              variant: "secondary",
              size: "lg",
              wrap: true,
              className: "w-full flex-none md:w-auto",
            })}
          >
            {copy.applyCta}
          </Link>
        </div>
        <p className="mt-6 text-[13px] leading-5 text-white/75">
          {copy.notGuaranteed}
        </p>
      </div>
    </section>
  );
}
