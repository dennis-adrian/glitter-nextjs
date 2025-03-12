import Link from "next/link";

import { cn } from "@/app/lib/utils";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import GlitterLogo from "@/app/components/landing/glitter-logo";
import {
  faFacebook,
  faInstagram,
  faTiktok,
} from "@fortawesome/free-brands-svg-icons";
import { headers } from "next/headers";
import { MailIcon } from "lucide-react";

export default async function Footer() {
  const pathname = await headers().then((headers) =>
    headers.get("x-current-path"),
  );

  return (
    <footer
      className={cn("py-12 bg-background border-t", {
        hidden:
          pathname?.includes("festivals") && pathname.includes("registration"),
      })}
    >
      <div className="container">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <GlitterLogo height={80} width={80} variant="dark" />
          </div>
          <div>
            <h3 className="text-lg font-bold mb-4">Enlaces Útiles</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/festivals/festicker"
                  className="text-muted-foreground hover:text-primary"
                >
                  Festicker
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-4">Conéctate con nosotros</h3>
            <div className="flex space-x-4">
              <Link
                target="_blank"
                href="https://www.instagram.com/glitter.bo"
                className="text-muted-foreground hover:text-primary"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-instagram"
                >
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                </svg>
                <span className="sr-only">Instagram</span>
              </Link>
              <Link
                target="_blank"
                href="https://tiktok.com/@glitter.bo"
                className="text-muted-foreground hover:text-primary"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M16.8217 5.1344C16.0886 4.29394 15.6479 3.19805 15.6479 2H14.7293M16.8217 5.1344C17.4898 5.90063 18.3944 6.45788 19.4245 6.67608C19.7446 6.74574 20.0786 6.78293 20.4266 6.78293V10.2191C18.645 10.2191 16.9932 9.64801 15.6477 8.68211V15.6707C15.6477 19.1627 12.8082 22 9.32386 22C7.50043 22 5.85334 21.2198 4.69806 19.98C3.64486 18.847 2.99994 17.3331 2.99994 15.6707C2.99994 12.2298 5.75592 9.42509 9.17073 9.35079M16.8217 5.1344C16.8039 5.12276 16.7861 5.11101 16.7684 5.09914M6.9855 17.3517C6.64217 16.8781 6.43802 16.2977 6.43802 15.6661C6.43802 14.0734 7.73249 12.7778 9.32394 12.7778C9.62087 12.7778 9.9085 12.8288 10.1776 12.9124V9.40192C9.89921 9.36473 9.61622 9.34149 9.32394 9.34149C9.27287 9.34149 8.86177 9.36884 8.81073 9.36884M14.7244 2H12.2097L12.2051 15.7775C12.1494 17.3192 10.8781 18.5591 9.32386 18.5591C8.35878 18.5591 7.50971 18.0808 6.98079 17.3564"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="sr-only">TikTok</span>
              </Link>
              <Link
                target="_blank"
                href="https://www.facebook.com/glitterfestival"
                className="text-muted-foreground hover:text-primary"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-facebook"
                >
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
                <span className="sr-only">Facebook</span>
              </Link>
            </div>
            <div className="mt-4">
              <p className="text-muted-foreground flex items-center">
                <MailIcon className="h-4 w-4 mr-2" />
                info@productoraglitter.com
              </p>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Productora Glitter. Todos los derechos
            reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
