import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import LowStimInit from "@/components/LowStimInit";
import AppNav from "@/components/AppNav";
import "./globals.css";

// Inter stays the body-copy font (readability-critical for medical content
// a patient is actually reading) — applied as the default on <body>. Space
// Grotesk is opt-in only, via the `font-display` utility, on headlines/nav/
// section titles. next/font's own --font-* variables feed into the
// `@theme inline` block in app/globals.css, which is where the actual
// `font-body`/`font-display` Tailwind utilities get defined — kept as two
// distinct variable names (not reused for both) so there's no ambiguity
// about which one wins where.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "ClearSignal — Lyme Disease Diagnostic Support",
  description:
    "AI-assisted diagnostic support for Lyme disease — RAG-grounded guidance, symptom/exposure journaling, and clinician handoff generation. Not a substitute for professional medical care.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-body h-full bg-midnight-950 text-slate-100`}
      >
        <LowStimInit />
        <AppNav />
        {children}
      </body>
    </html>
  );
}
