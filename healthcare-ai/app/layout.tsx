import type { Metadata } from "next";
import { Inter } from "next/font/google";
import LowStimInit from "@/components/LowStimInit";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={`${inter.className} h-full bg-slate-50 text-slate-900`}>
        <LowStimInit />
        {children}
      </body>
    </html>
  );
}
