/** The team's own words, quoted under a card's body, such as a reason. */
export default function TeamQuote({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <figure className="rounded-xl bg-brand-lavender/40 px-3 py-2.5 text-sm leading-relaxed text-brand-ink">
      <figcaption className="text-xs font-semibold text-brand-neutral">
        {label}
      </figcaption>
      <blockquote className="whitespace-pre-line">{text}</blockquote>
    </figure>
  );
}
