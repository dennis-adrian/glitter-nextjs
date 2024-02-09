import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";

import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";

import { EdgeStoreProvider } from "@/app/lib/edgestore";

import Navbar from "@/app/ui/navbar";
import { Toaster } from "@/components/ui/sonner";
import { inter } from "@/ui/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "Festival Glitter",
  description: "Un festival para que los artistas brillen",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider localization={esES}>
      <html lang="es">
        <body className={inter.className}>
          <EdgeStoreProvider>
            <Navbar />
            <main className={`${inter.className}`}>{children}</main>
            <Toaster richColors />
            <Analytics />
          </EdgeStoreProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
