import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

interface LogEntry {
  symptoms: string;
  severity: "low" | "medium" | "high";
  notes?: string;
  createdAt: string;
  vitals?: Record<string, unknown>;
}

interface UserProfile {
  age?: number;
  bloodType?: string;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { logs, profile } = body as { logs: LogEntry[]; profile?: UserProfile };

    if (!logs || !Array.isArray(logs)) {
      return NextResponse.json({ error: "logs array is required" }, { status: 400 });
    }

    if (logs.length === 0) {
      return NextResponse.json({
        insights: "No health logs found. Start logging your symptoms and vitals to receive personalized AI insights.",
      });
    }

    const profileSection = profile
      ? [
          profile.age ? `Age: ${profile.age}` : null,
          profile.bloodType ? `Blood type: ${profile.bloodType}` : null,
          profile.allergies?.length ? `Allergies: ${profile.allergies.join(", ")}` : null,
          profile.conditions?.length ? `Conditions: ${profile.conditions.join(", ")}` : null,
          profile.medications?.length ? `Medications: ${profile.medications.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const logLines = logs
      .slice(0, 20)
      .map((l) => {
        const vitalsStr =
          l.vitals && Object.keys(l.vitals).length
            ? ` | vitals: ${Object.entries(l.vitals)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}`
            : "";
        return `• [${new Date(l.createdAt).toLocaleDateString()}] ${l.symptoms} (${l.severity})${l.notes ? ` — ${l.notes}` : ""}${vitalsStr}`;
      })
      .join("\n");

    const userContent = `${profileSection ? `PATIENT PROFILE:\n${profileSection}\n\n` : ""}RECENT HEALTH LOGS (${logs.length} total, showing up to 20):\n${logLines}

Please provide a structured health log analysis with these sections:
1. **Patterns** — recurring symptoms or trends you notice
2. **Observations** — notable findings (e.g., severity trends, vital sign patterns)
3. **Wellness Recommendations** — general lifestyle or self-care suggestions based on the data
4. **When to Seek Care** — any flags that warrant a doctor visit

Be concise and practical. This is general wellness guidance only.`;

    const completion = await getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You are a health data analyst providing general wellness insights from symptom logs. Never diagnose medical conditions. Always recommend consulting a qualified healthcare professional for medical concerns. Be empathetic, clear, and concise.",
        },
        { role: "user", content: userContent },
      ],
    });

    const insights = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ insights });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status: number }).status === 429
    ) {
      return NextResponse.json(
        { error: "Rate limit reached. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to generate insights";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
