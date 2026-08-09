"use client";

import { useLowStimMode } from "@/lib/low-stim";

// Renders nothing — just applies the stored low-stim preference to <html> on
// every page load, so it holds even on a hard refresh of a page that doesn't
// happen to render the toggle button itself.
export default function LowStimInit() {
  useLowStimMode();
  return null;
}
