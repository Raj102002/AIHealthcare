import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

interface NppesResult {
  number: string;
  basic: { first_name?: string; last_name?: string; organization_name?: string; credential?: string };
  addresses: { address_purpose: string; city: string; state: string; telephone_number?: string }[];
  taxonomies: { desc: string; primary: boolean }[];
}

// Provider lookup (ClearSignal build spec, section 6.12) — a plain proxy over
// the public NPPES NPI registry, filtered by specialty taxonomy and state/city
// only. Never ranked by suitability for the patient's presentation — that
// would imply a clinical judgment this app doesn't make.
export const GET = withMetrics("providers", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(`providers:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty") || "";
  const state = searchParams.get("state") || "";
  const city = searchParams.get("city") || "";

  if (!state) {
    return NextResponse.json({ error: "state is required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    version: "2.1",
    state,
    limit: "20",
    enumeration_type: "NPI-1",
  });
  if (specialty) params.set("taxonomy_description", specialty);
  if (city) params.set("city", city);

  try {
    const res = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`);
    if (!res.ok) throw new Error(`NPPES returned ${res.status}`);
    const data = (await res.json()) as { results?: NppesResult[] };

    const providers = (data.results ?? []).map((r) => {
      const address = r.addresses.find((a) => a.address_purpose === "LOCATION") ?? r.addresses[0];
      const primaryTaxonomy = r.taxonomies.find((t) => t.primary) ?? r.taxonomies[0];
      return {
        npi: r.number,
        name: r.basic.organization_name || `${r.basic.first_name ?? ""} ${r.basic.last_name ?? ""}`.trim(),
        credential: r.basic.credential,
        specialty: primaryTaxonomy?.desc,
        city: address?.city,
        state: address?.state,
        phone: address?.telephone_number,
      };
    });

    return NextResponse.json({
      providers,
      disclaimer:
        "Results are matched by specialty and location only -- they are not ranked by suitability " +
        "for your situation, which is a clinical judgment this app doesn't make.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
