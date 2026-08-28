import type { Metadata } from "next";
import { Bricolage_Grotesque, Newsreader, IBM_Plex_Mono } from "next/font/google";
import LowStimInit from "@/components/LowStimInit";
import AppNav from "@/components/AppNav";
import "./globals.css";

// Bricolage Grotesque is the pervasive UI default (nav, buttons, labels,
// user's own messages) -- applied directly on <body> via `font-display`.
// Newsreader is opt-in only, via `font-serif`, for Aura's response prose
// specifically (components/ui/Turn.tsx) -- never used for UI chrome. IBM
// Plex Mono is opt-in via `font-mono` for labels/citations/timestamps/
// numeric readouts (components/ui/MonoLabel.tsx and friends). IBM Plex Mono
// isn't a variable font on Google Fonts, so its weights are listed
// explicitly; the other two are variable fonts and don't need that. next/
// font's --font-* variables feed into the `@theme inline` block in
// app/globals.css, which is where the real font-display/font-serif/font-mono
// Tailwind utilities are defined.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

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
        className={`${bricolage.variable} ${newsreader.variable} ${plexMono.variable} font-display h-full bg-pitch text-bone`}
      >
        <LowStimInit />
        <AppNav />
        {children}
      </body>
    </html>
  );
}
