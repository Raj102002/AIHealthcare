"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  MessageSquare,
  Activity,
  Clock,
  TestTube2,
  Compass,
  Users,
  FileText,
  BookMarked,
  Info,
} from "lucide-react";
import { getCurrentUser, initializeParse } from "@/lib/parse-client";

// The 8 sections the v2 spec asks for, mapped onto existing routes where one
// already covers the concept (see plan §7) plus 3 new ones (My Timeline,
// Resources, Sources). This is intentionally a thin strip, not a second full
// header -- every page already has its own header with logo/logout/page-
// specific actions, and duplicating that here would be redundant chrome, not
// a real fix for the actual gap (nothing made all 8 sections reachable from
// anywhere).
const SECTIONS = [
  { href: "/chat", label: "Ask ClearSignal", icon: MessageSquare },
  { href: "/journal", label: "My Symptoms", icon: Activity },
  { href: "/timeline", label: "My Timeline", icon: Clock },
  { href: "/test-context", label: "Tests", icon: TestTube2 },
  { href: "/resources", label: "Resources", icon: Compass },
  { href: "/providers", label: "Find Care", icon: Users },
  { href: "/handoff", label: "Clinician Summary", icon: FileText },
  { href: "/sources", label: "Sources", icon: BookMarked },
];

// Hidden on the login screen and the internal admin dashboard -- everywhere
// else is behind the same getCurrentUser() gate every page already enforces
// individually, so this mirrors that rather than becoming a second source of
// truth for auth.
const HIDDEN_ON = ["/", "/admin"];

export default function AppNav() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    initializeParse();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the same browser-only Parse SDK check every page does in its own effect
    setAuthed(!!getCurrentUser());
  }, [pathname]);

  if (!authed || HIDDEN_ON.includes(pathname)) return null;

  return (
    <nav className="sticky top-0 z-30 glass-panel overflow-x-auto">
      <div className="max-w-4xl mx-auto flex items-center gap-1 px-2">
        {SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 text-xs whitespace-nowrap px-3 py-2.5 border-b-2 transition-colors ${
                active
                  ? "border-teal-400 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-100 hover:border-slate-600"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? "text-teal-400 drop-shadow-[0_0_6px_rgba(45,212,191,0.6)]" : ""}`} />
              {label}
            </Link>
          );
        })}
        <Link
          href="/scope"
          className={`flex items-center gap-1.5 text-xs whitespace-nowrap px-3 py-2.5 border-b-2 ml-auto transition-colors ${
            pathname === "/scope"
              ? "border-cyan-400 text-white"
              : "border-transparent text-slate-400 hover:text-slate-100 hover:border-slate-600"
          }`}
        >
          <Info className={`w-3.5 h-3.5 ${pathname === "/scope" ? "text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" : ""}`} />
          What this can/cannot do
        </Link>
      </div>
    </nav>
  );
}
