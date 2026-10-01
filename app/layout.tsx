import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DemoProvider } from "@/components/DemoProvider";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fleet Control — Demonstration",
  description: "Simulated 50-vehicle fleet management demonstration. Synthetic data; no live GPS connection.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh">
        <DemoProvider>
          <Header />
          <main className="pb-8 sm:pb-0">{children}</main>
        </DemoProvider>
      </body>
    </html>
  );
}
