"use client";

import { useCallback, useEffect, useState } from "react";

// Low-stimulation mode (ClearSignal build spec, section 6.13): reduced motion,
// muted palette, lower density, larger tap targets — for light sensitivity and
// cognitive fatigue, both common in this population. Persisted in localStorage
// so it applies across the whole app once set, not just the page it was
// toggled on. See app/globals.css for the actual [data-low-stim="true"] rules.
const STORAGE_KEY = "healthai_low_stim_mode";

export function useLowStimMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a browser-only persisted preference on mount, must stay effect-gated
    setEnabled(stored);
    document.documentElement.dataset.lowStim = String(stored);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      document.documentElement.dataset.lowStim = String(next);
      return next;
    });
  }, []);

  return { enabled, toggle };
}
