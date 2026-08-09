import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

interface CtGovStudy {
  protocolSection: {
    identificationModule: { nctId: string; briefTitle: string };
    statusModule: { overallStatus: string };
    contactsLocationsModule?: { locations?: { city: string; state?: string; country: string }[] };
  };
}

// Trial lookup (ClearSignal build spec, section 6.12) — a plain proxy over the
// public ClinicalTrials.gov API v2. Condition is fixed to Lyme disease, since
// this app's corpus is scoped there; location is the only other filter.
export async function GET(request: NextRequest) {
  const { allowed, retryAfterSeconds } = checkRateLimit(`trials:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const location = searchParams.get("location") || "";

  const params = new URLSearchParams({
    "query.cond": "Lyme Disease",
    pageSize: "15",
    fields: "NCTId,BriefTitle,OverallStatus,LocationCity,LocationState,LocationCountry",
  });
  if (location) params.set("query.locn", location);

  try {
    const res = await fetch(`https://clinicaltrials.gov/api/v2/studies?${params.toString()}`);
    if (!res.ok) throw new Error(`ClinicalTrials.gov returned ${res.status}`);
    const data = (await res.json()) as { studies?: CtGovStudy[] };

    const trials = (data.studies ?? []).map((s) => ({
      nctId: s.protocolSection.identificationModule.nctId,
      title: s.protocolSection.identificationModule.briefTitle,
      status: s.protocolSection.statusModule.overallStatus,
      locations: (s.protocolSection.contactsLocationsModule?.locations ?? [])
        .slice(0, 3)
        .map((l) => [l.city, l.state, l.country].filter(Boolean).join(", ")),
      url: `https://clinicaltrials.gov/study/${s.protocolSection.identificationModule.nctId}`,
    }));

    return NextResponse.json({ trials });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
