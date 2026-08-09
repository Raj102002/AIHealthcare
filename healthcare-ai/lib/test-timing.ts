// Negative-test contextualizer (ClearSignal build spec, section 6.3) — the
// spec's own "highest priority feature." The date math and window
// classification here are fully deterministic; only the sourced explanation
// text comes from retrieval, never from a model doing the arithmetic.
const DAY_MS = 24 * 60 * 60 * 1000;

// CDC-stated IgM peak window is 3-6 weeks post-infection; testing before ~3
// weeks (21 days) risks a false negative from an antibody response that
// hasn't developed yet (see corpus/testing-and-diagnosis.md).
const RELIABLE_WINDOW_START_DAYS = 21;
const RELIABLE_WINDOW_END_DAYS = 42;

export type TestTimingWindow = "before_reliable_window" | "within_reliable_window" | "after_reliable_window";

export interface TestTimingResult {
  daysFromOnset: number;
  window: TestTimingWindow;
}

export function computeTestTiming(symptomOnsetDate: Date, testDate: Date): TestTimingResult {
  const daysFromOnset = Math.round((testDate.getTime() - symptomOnsetDate.getTime()) / DAY_MS);
  let window: TestTimingWindow;
  if (daysFromOnset < RELIABLE_WINDOW_START_DAYS) window = "before_reliable_window";
  else if (daysFromOnset <= RELIABLE_WINDOW_END_DAYS) window = "within_reliable_window";
  else window = "after_reliable_window";
  return { daysFromOnset, window };
}

export function shouldSuggestRetest(window: TestTimingWindow): boolean {
  return window === "before_reliable_window";
}
