import NotFoundMessage from "@/app/components/not-found-message";
import { buttonVariants } from "@/app/components/ui/button";

/**
 * The 404 for an address no page answers, under the root layout alone.
 *
 * Next sends this file with every page of the app and loads what it imports,
 * so it must stay light: no site header or footer (Clerk, the navbar), which
 * `/links` must not carry. A link takes the visitor back to the site. A page
 * of the site that calls `notFound()` gets `app/(site)/not-found.tsx`, inside
 * the header and footer.
 */
export default function NotFound() {
  return (
    <main>
      <NotFoundMessage>
        {/* A full load on purpose: the site's layout, with Clerk and its
            header, is not mounted here, and should render on the server. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above */}
        <a href="/" className={buttonVariants({ wrap: true })}>
          Ir al inicio
        </a>
      </NotFoundMessage>
    </main>
  );
}
