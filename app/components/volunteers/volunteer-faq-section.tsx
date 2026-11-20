import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";
import { SOCIAL_LINKS } from "@/app/lib/site-contact";
import {
  VOLUNTEER_COPY,
  VOLUNTEER_FAQ,
  VOLUNTEERS_EMAIL,
} from "@/app/lib/volunteers/definitions";

const INSTAGRAM_URL =
  SOCIAL_LINKS.find((link) => link.network === "instagram")?.href ??
  "https://www.instagram.com/glitter.bo";

/** Three questions; the contact answer links the email and Instagram. */
export default function VolunteerFaqSection() {
  return (
    <section id="preguntas" className="bg-brand-elevated">
      <div className="mx-auto max-w-3xl px-5 py-14 md:px-10 md:py-20">
        <h2 className="mb-4 font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.5px] text-brand-ink md:text-[44px]">
          {VOLUNTEER_COPY.faqTitle}
        </h2>
        <Accordion type="multiple" className="text-brand-ink">
          {VOLUNTEER_FAQ.map((item, index) => (
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
          <AccordionItem value="faq-contact" className="border-brand-border">
            <AccordionTrigger className="min-h-11 text-left font-display text-lg font-semibold md:text-xl">
              ¿A quién le escribo si tengo dudas?
            </AccordionTrigger>
            <AccordionContent className="text-base leading-7 text-brand-neutral">
              Escribinos a{" "}
              <a
                href={`mailto:${VOLUNTEERS_EMAIL}`}
                className="font-semibold text-brand-primary wrap-anywhere hover:underline"
              >
                {VOLUNTEERS_EMAIL}
              </a>{" "}
              o por Instagram a{" "}
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brand-primary hover:underline"
              >
                @glitter.bo
              </a>
              .
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}
