import type { Metadata, Viewport } from "next";
import { Barlow, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { DemoProvider } from "@/components/DemoProvider";
import { Header } from "@/components/Header";
import "./globals.css";

// Self-hosted at build time, so the offline preview keeps its typography.
const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Fleet Control — Demonstration",
  description: "Simulated 50-vehicle fleet management demonstration. Synthetic data; no live GPS connection.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${barlow.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">
        <DemoProvider>
          <Header />
          <main className="pb-8 sm:pb-0">{children}</main>
        </DemoProvider>
      </body>
    </html>
  );
}
