import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";

import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";

import { EdgeStoreProvider } from "@/app/lib/edgestore";

import { Toaster } from "@/components/ui/sonner";
import { inter } from "@/ui/fonts";

import Navbar from "@/app/components/navbar/navbar";
import Footer from "@/app/components/footer";

import "./globals.css";
import { getEnvLabel } from "./lib/config";
import "@uploadthing/react/styles.css";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

export const metadata: Metadata = {
  title: {
    template: `${getEnvLabel()} %s | Festival Glitter`,
    default: `${getEnvLabel()} Festival Glitter`,
  },
  description: "Un festival para que los artistas brillen",
  keywords: ["festival", "glitter", "artistas", "ilustración", "arte"],
  metadataBase: new URL(baseUrl || "https://www.festivalglitter.com"),
  openGraph: {
    title: "Festival Glitter",
    description: "Un festival para que los artistas brillen",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider localization={esES}>
      <html lang="es">
        <body className={`${inter.variable} font-sans`}>
          <EdgeStoreProvider>
            <Navbar />
            <main className="min-h-[calc(100vh-64px-180px)] md:min-h-[calc(100vh-80px-140px)]">
              {children}
            </main>
            <Footer />
            <Toaster richColors />
            <Analytics />
          </EdgeStoreProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
