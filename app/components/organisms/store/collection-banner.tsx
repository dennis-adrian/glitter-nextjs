import Image from "next/image";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import type { MerchCollection } from "@/app/lib/merch/definitions";
import { merchCollectionPath } from "@/app/lib/merch/paths";

export default function CollectionBanner({
  collection,
  isCollectionPage = false,
  preview = false,
}: {
  collection: MerchCollection;
  isCollectionPage?: boolean;
  preview?: boolean;
}) {
  const campaign = collection.campaignImageUrl;
  const lightText = !!campaign && collection.campaignTextTone === "light";
  const Heading = preview ? "h4" : "h1";
  // Combos sit between the banner and the catalog, so landing on the catalog
  // would scroll past them. bundleIds holds exactly the bundles the collection
  // page renders there, so #combos exists whenever it is non-empty.
  const section = collection.bundleIds?.length ? "#combos" : "#catalogo";
  const href = isCollectionPage
    ? section
    : `${merchCollectionPath(collection.slug)}${section}`;
  // The whole banner leads where its button does. The button stays the one
  // accessible link; this layer only widens the click target.
  const bannerLink = preview ? null : (
    <Link
      href={href}
      tabIndex={-1}
      aria-hidden="true"
      className="absolute inset-0"
    />
  );
  const copy = (
    <>
      <Heading className="font-display text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl">
        {collection.name}
      </Heading>
      {collection.description && (
        <p
          className={`mt-4 max-w-md whitespace-pre-line text-base leading-relaxed opacity-85 ${isCollectionPage ? "" : "line-clamp-3"}`}
        >
          {collection.description}
        </p>
      )}
      <Button
        asChild
        size="sm"
        className={
          lightText
            ? "relative z-10 mt-6 bg-white text-brand-ink hover:bg-white/90"
            : "relative z-10 mt-6"
        }
      >
        {preview ? (
          <span aria-hidden="true">Explorar colección</span>
        ) : (
          <Link href={href}>
            {isCollectionPage ? "Ver productos" : "Explorar colección"}
          </Link>
        )}
      </Button>
    </>
  );

  if (campaign) {
    return (
      <section
        aria-label={`Colección ${collection.name}`}
        className={
          lightText
            ? "relative isolate overflow-hidden rounded-2xl bg-brand-ink text-white"
            : "relative isolate overflow-hidden rounded-2xl bg-background text-foreground"
        }
      >
        <div className="relative aspect-[3/2] sm:aspect-[12/5] md:absolute md:inset-0 md:aspect-auto">
          <Image
            src={campaign}
            alt={`Campaña de ${collection.name}`}
            fill
            priority
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="object-cover object-right"
          />
        </div>
        <div
          aria-hidden="true"
          className={
            lightText
              ? "pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-black/90 via-black/60 to-transparent md:block"
              : "pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-white/95 via-white/60 to-transparent md:block"
          }
        />
        <div className="relative p-6 md:flex md:min-h-[360px] md:w-1/2 md:flex-col md:items-start md:justify-center md:p-9 lg:min-h-[460px] lg:p-12">
          {copy}
        </div>
        {bannerLink}
      </section>
    );
  }

  return (
    <section
      aria-label={`Colección ${collection.name}`}
      className="relative isolate flex flex-col-reverse overflow-hidden rounded-2xl bg-brand-lavender text-brand-ink md:grid md:grid-cols-2"
    >
      <div className="flex flex-col items-start justify-center p-6 md:p-9 lg:p-12">
        {copy}
      </div>
      <div className="relative aspect-[3/2] sm:aspect-[12/5] md:aspect-auto md:min-h-[360px] lg:min-h-[460px]">
        <Image
          src={
            collection.imageUrl ||
            "/img/landing-festivals/glitter-characters.png"
          }
          alt={`Arte de ${collection.name}`}
          fill
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-contain p-6"
        />
      </div>
      {bannerLink}
    </section>
  );
}
