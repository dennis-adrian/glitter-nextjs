import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";
import {
  CULTURAL_ACTIVITY_COPY,
  CULTURAL_ACTIVITY_FAQ,
} from "@/app/lib/live_acts/definitions";
import { SOCIAL_LINKS } from "@/app/lib/site-contact";

const INSTAGRAM_URL =
  SOCIAL_LINKS.find((link) => link.network === "instagram")?.href ??
  "https://www.instagram.com/glitter.bo";

const linkClassName = "font-semibold text-brand-primary hover:underline";

/** The last section of /actividades-culturales. */
export default function CulturalActivitiesFaq() {
  const copy = CULTURAL_ACTIVITY_COPY;
  return (
    <section id="preguntas" className="bg-brand-elevated">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-14 md:px-10 md:py-20 lg:flex-row lg:gap-16 lg:px-20">
        <div className="min-w-0 lg:max-w-[380px] lg:flex-none">
          <h2 className="font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.5px] text-brand-ink md:text-[44px]">
            {copy.faqTitle}
          </h2>
          <p className="mt-4 text-base leading-7 break-words text-brand-neutral">
            {copy.faqContactLead}{" "}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className={linkClassName}
            >
              {copy.instagramHandle}
            </a>{" "}
            {copy.faqContactMiddle}{" "}
            <a
              href={`mailto:${copy.contactEmail}`}
              className={`${linkClassName} wrap-anywhere`}
            >
              {copy.contactEmail}
            </a>
            .
          </p>
        </div>
        <Accordion
          type="multiple"
          defaultValue={["faq-0"]}
          className="min-w-0 flex-1 text-brand-ink"
        >
          {CULTURAL_ACTIVITY_FAQ.map((item, index) => (
            <AccordionItem
              key={item.question}
              value={`faq-${index}`}
              className="border-brand-border"
            >
              <AccordionTrigger className="min-h-11 text-left font-display text-lg font-semibold md:text-xl">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-base leading-7 break-words text-brand-neutral">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
