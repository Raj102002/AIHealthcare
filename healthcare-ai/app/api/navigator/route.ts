import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieval";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";
import { navigatorRequestSchema, formatZodError } from "@/lib/validation";
import { computeEvidenceTier } from "@/lib/evidence-tier";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// Never ranked by clinical fit -- same stance as /api/providers and
// /api/trials, now stated to the client instead of only in a code comment.
const CARE_DISCLAIMER =
  "These results are matched by specialty/location or by topic only. They are not ranked by " +
  "suitability for your situation -- that's a clinical judgment this app doesn't make.";

export interface ResourceCard {
  title: string;
  whyRelevant: string;
  source: string;
  link: string | null;
  agency: string;
}

interface NppesResult {
  number: string;
  basic: { first_name?: string; last_name?: string; organization_name?: string; credential?: string };
  addresses: { address_purpose: string; city: string; state: string; telephone_number?: string }[];
  taxonomies: { desc: string; primary: boolean }[];
}

interface CtGovStudy {
  protocolSection: {
    identificationModule: { nctId: string; briefTitle: string };
    statusModule: { overallStatus: string };
    contactsLocationsModule?: { locations?: { city: string; state?: string; country: string }[] };
  };
}

async function corpusCards(question: string, groq: Groq): Promise<ResourceCard[]> {
  const retrieved = await retrieve(question, groq);
  return retrieved.map((c) => ({
    title: c.metadata.section_path,
    whyRelevant: `Matched your question with ${computeEvidenceTier([c])} evidence support (CDC source, relevance score ${c.score.toFixed(1)}/10).`,
    source: c.metadata.source_name,
    link: c.metadata.source_url || null,
    agency: "CDC",
  }));
}

// Same NPPES query /api/providers makes, reshaped into ResourceCard[]. Not
// factored into a shared helper with that route since the two response
// shapes (flat provider record vs. navigator card) are genuinely different,
// not a duplicate of the same shape.
async function providerCards(state: string, city: string): Promise<ResourceCard[]> {
  if (!state) return [];
  const params = new URLSearchParams({ version: "2.1", state, limit: "10", enumeration_type: "NPI-1" });
  if (city) params.set("city", city);

  try {
    const res = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: NppesResult[] };
    return (data.results ?? []).slice(0, 5).map((r) => {
      const address = r.addresses.find((a) => a.address_purpose === "LOCATION") ?? r.addresses[0];
      const primaryTaxonomy = r.taxonomies.find((t) => t.primary) ?? r.taxonomies[0];
      const name = r.basic.organization_name || `${r.basic.first_name ?? ""} ${r.basic.last_name ?? ""}`.trim();
      return {
        title: `${name}${primaryTaxonomy?.desc ? ` — ${primaryTaxonomy.desc}` : ""}`,
        whyRelevant: `Listed in ${address?.city ?? city}, ${address?.state ?? state}.`,
        source: "NPPES National Provider Identifier Registry",
        link: "https://npiregistry.cms.hhs.gov/search",
        agency: "HHS / CMS",
      };
    });
  } catch {
    return [];
  }
}

async function trialCards(location: string): Promise<ResourceCard[]> {
  const params = new URLSearchParams({
    "query.cond": "Lyme Disease",
    pageSize: "5",
    fields: "NCTId,BriefTitle,OverallStatus,LocationCity,LocationState,LocationCountry",
  });
  if (location) params.set("query.locn", location);

  try {
    const res = await fetch(`https://clinicaltrials.gov/api/v2/studies?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { studies?: CtGovStudy[] };
    return (data.studies ?? []).map((s) => {
      const nctId = s.protocolSection.identificationModule.nctId;
      const locations = (s.protocolSection.contactsLocationsModule?.locations ?? [])
        .slice(0, 2)
        .map((l) => [l.city, l.state, l.country].filter(Boolean).join(", "));
      return {
        title: s.protocolSection.identificationModule.briefTitle,
        whyRelevant: `Lyme disease clinical trial, status: ${s.protocolSection.statusModule.overallStatus}${
          locations.length > 0 ? `. Locations: ${locations.join("; ")}` : ""
        }.`,
        source: "ClinicalTrials.gov",
        link: `https://clinicaltrials.gov/study/${nctId}`,
        agency: "NIH / National Library of Medicine",
      };
    });
  } catch {
    return [];
  }
}

// Symptom-to-resource navigator (ClearSignal v2 spec — "Symptom-to-resource
// navigator"). Fans out to the existing CDC corpus retrieval pipeline
// (lib/retrieval.ts) plus the same NPPES/ClinicalTrials.gov sources
// /api/providers and /api/trials already query, and normalizes all three
// into one ResourceCard[] shape the UI can render as cards. No new data
// access, no new ranking logic -- the fan-out and card normalization are the
// only new code.
export const POST = withMetrics("navigator", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(`navigator:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = navigatorRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { question, location } = parsed.data;
    const groq = getGroq();

    const state = location?.state ?? "";
    const city = location?.city ?? "";
    const locationQuery = [city, state].filter(Boolean).join(", ");

    const [education, providers, trials] = await Promise.all([
      corpusCards(question, groq),
      providerCards(state, city),
      trialCards(locationQuery),
    ]);

    return NextResponse.json({
      cards: { education, providers, trials },
      disclaimer: CARE_DISCLAIMER,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
