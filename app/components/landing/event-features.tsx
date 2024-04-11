import Image from "next/image";

function Figure({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure>
      <Image className="m-auto" src={src} alt={alt} width={320} height={310} />
      <figcaption className="font-semibold">{caption}</figcaption>
    </figure>
  );
}

export default function EventFeatures() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-screen-lg m-auto">
      <Figure
        src="/img/landing/mascot-illustration.png"
        alt="Samy ilustrador"
        caption="Ilustración"
      />
      <Figure
        src="/img/landing/mascot-pin.png"
        alt="Samy con un pin"
        caption="Pines"
      />
      <Figure
        src="/img/landing/mascot-comic.png"
        alt="Samy con un comic"
        caption="Cómics"
      />
      <Figure
        src="/img/landing/mascot-stickers.png"
        alt="Samy con stickers"
        caption="Stickers"
      />
    </div>
  );
}
