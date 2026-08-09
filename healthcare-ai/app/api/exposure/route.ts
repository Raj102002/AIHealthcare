import { NextRequest, NextResponse } from "next/server";
import { loadCorpusChunks } from "@/lib/corpus-lookup";

// Exposure reconstruction (ClearSignal build spec, section 6.5) — deliberately
// deterministic and Groq-free. This never asks "were you bitten by a tick"
// (most confirmed Lyme patients never recall a bite, and a "no" gets used
// against them) — it cross-references reported outdoor activity against real
// CDC county surveillance data already in the corpus, and frames the result as
// documented exposure OPPORTUNITY, never as "you were exposed." A low-incidence
// county is never framed as ruling anything out.

interface MonthActivity {
  month: string;
  year: number;
  activities: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { state, county, months } = body as { state?: string; county?: string; months?: MonthActivity[] };

    if (!state?.trim() || !county?.trim()) {
      return NextResponse.json({ error: "state and county are required" }, { status: 400 });
    }

    const corpus = loadCorpusChunks();
    const countyId = `county:${state.trim()}:${county.trim()}`;
    const chunk = corpus.find((c) => c.id === countyId);

    if (!chunk) {
      return NextResponse.json({
        found: false,
        message: `No CDC surveillance data was found for "${county.trim()}, ${state.trim()}" — double-check the county name matches its official spelling (e.g. "Autauga County", not "Autauga").`,
      });
    }

    const activitiesLogged = (months ?? []).filter((m) => m.activities.length > 0);
    const activitySummary =
      activitiesLogged.length > 0
        ? activitiesLogged
            .map((m) => `${m.month} ${m.year} (${m.activities.join(", ")})`)
            .join("; ")
        : null;

    const lines: string[] = [];
    if (activitySummary) {
      lines.push(`Between the periods you logged — ${activitySummary} — you reported outdoor activity in ${county.trim()}, ${state.trim()}.`);
    } else {
      lines.push(`You're asking about ${county.trim()}, ${state.trim()}.`);
    }
    lines.push(`${chunk.text.split("\n\n").slice(1).join(" ")} [1]`);
    lines.push(
      "This describes documented exposure opportunity in this county — it does not mean you were exposed, and a low case count does not rule Lyme disease out. Reported case counts are also known to undercount true incidence."
    );

    return NextResponse.json({
      found: true,
      message: lines.join("\n\n"),
      sources: [
        {
          number: 1,
          source_name: chunk.metadata.source_name,
          source_url: chunk.metadata.source_url,
          section_path: chunk.metadata.section_path,
        },
      ],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
