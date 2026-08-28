"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  LayoutDashboard,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { getCurrentUser, initializeParse, logoutUser } from "@/lib/parse-client";
import LowStimToggle from "@/components/LowStimToggle";

// Primary row capped at 5 -- the app's actual golden path, not every route
// that exists. Everything else lives behind "More" instead of competing for
// space in the always-visible row. (Previous version tried to fit all 8+
// destinations into one row constrained to max-w-4xl regardless of viewport
// width -- that's what was overflowing/wrapping into a second, colliding row.)
const PRIMARY = [
  { href: "/chat", label: "Ask Aura", icon: MessageSquare },
  { href: "/journal", label: "Symptoms", icon: Activity },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/test-context", label: "Tests", icon: TestTube2 },
  { href: "/providers", label: "Find Care", icon: Users },
];

const MORE = [
  { href: "/resources", label: "Resources", icon: Compass },
  { href: "/handoff", label: "Clinician Summary", icon: FileText },
  { href: "/sources", label: "Sources", icon: BookMarked },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/scope", label: "What this can/cannot do", icon: Info },
];

// Hidden on the login screen and the internal admin dashboard -- everywhere
// else is behind the same getCurrentUser() gate every page already enforces
// individually, so this mirrors that rather than becoming a second source of
// truth for auth.
const HIDDEN_ON = ["/", "/admin"];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeParse();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the same browser-only Parse SDK check every page does in its own effect
    setAuthed(!!getCurrentUser());
  }, [pathname]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing the menu is a response to an external signal (route change from the router), not derived render state
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [moreOpen]);

  async function handleLogout() {
    await logoutUser();
    router.replace("/");
  }

  if (!authed || HIDDEN_ON.includes(pathname)) return null;

  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  return (
    <nav className="glass-panel shrink-0">
      <div className="flex items-center gap-1 px-3 flex-nowrap">
        {PRIMARY.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 text-xs whitespace-nowrap px-2.5 py-2.5 border-b-2 transition-colors ${
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

        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className={`flex items-center gap-1 text-xs whitespace-nowrap px-2.5 py-2.5 border-b-2 transition-colors ${
              moreActive || moreOpen
                ? "border-teal-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-100 hover:border-slate-600"
            }`}
          >
            More
            <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="glass-panel-strong absolute left-0 top-full mt-1 w-56 rounded-xl py-1.5 z-40"
            >
              {MORE.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    className={`flex items-center gap-2 text-xs px-3 py-2 transition-colors ${
                      active ? "text-teal-300" : "text-slate-300 hover:text-slate-100 hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right-aligned cluster, visually separated from the destination
            links -- these are account/preference actions, not sections. */}
        <div className="ml-auto flex items-center gap-1 pl-2 border-l border-white/10 my-1.5">
          <LowStimToggle />
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs whitespace-nowrap px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
