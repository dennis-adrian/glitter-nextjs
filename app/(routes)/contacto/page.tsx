import type { Metadata } from "next";

import Heading from "@/app/components/atoms/heading";
import ContactList from "@/app/components/contact/contact-list";

export const metadata: Metadata = {
  title: "Contacto",
};

/**
 * Where the sidebar and the phone menu send signed-in people for the site
 * footer's contact, since signed-in screens have no footer.
 */
export default function ContactPage() {
  return (
    <div className="container flex max-w-xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Heading data-installed-title="">Contacto</Heading>
        <p className="text-sm text-brand-neutral md:text-base">
          Escribinos o seguinos en redes.
        </p>
      </div>
      <div className="rounded-2xl border border-brand-border bg-brand-card px-4">
        <ContactList />
      </div>
    </div>
  );
}
