// Input validation schemas (Security & Costs — input validation/sanitization).
// Applied at every route that parses a JSON body from an untrusted client.
// Failures return a 400 with the specific validation error rather than
// letting malformed input reach retrieval/generation code downstream.
import { z } from "zod";

const MAX_MESSAGE_LENGTH = 8000;
const MAX_MESSAGES = 50;

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
      })
    )
    .min(1)
    .max(MAX_MESSAGES),
  userProfile: z
    .object({
      allergies: z.array(z.string()).optional(),
      conditions: z.array(z.string()).optional(),
      medications: z.array(z.string()).optional(),
      age: z.number().min(0).max(150).optional(),
      bloodType: z.string().max(10).optional(),
      preferredLanguage: z.string().max(10).optional(),
    })
    .optional(),
});

export const testContextRequestSchema = z.object({
  symptomOnsetDate: z.string().min(1),
  testDate: z.string().min(1),
});

export const exposureRequestSchema = z.object({
  state: z.string().min(1).max(50),
  county: z.string().min(1).max(100),
  months: z
    .array(
      z.object({
        month: z.string().max(20),
        year: z.number().min(1900).max(2100),
        activities: z.array(z.string().max(100)).max(20),
      })
    )
    .max(24)
    .optional(),
});

export const handoffNarrativeRequestSchema = z.object({
  // Full structural validation of HandoffAnalysis is intentionally not
  // duplicated here — it's server-computed (lib/handoff-analysis.ts), not
  // user-authored, and this endpoint's real exposure is a client sending an
  // oversized or malformed payload, not a spoofed-but-plausible one.
  analysis: z.record(z.string(), z.unknown()),
});

export const speakRequestSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const healthInsightsRequestSchema = z.object({
  logs: z
    .array(
      z.object({
        symptoms: z.string().max(2000),
        severity: z.enum(["low", "medium", "high"]),
        notes: z.string().max(2000).optional(),
        createdAt: z.string(),
        vitals: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(200),
  profile: z
    .object({
      age: z.number().min(0).max(150).optional(),
      bloodType: z.string().max(10).optional(),
      allergies: z.array(z.string()).optional(),
      conditions: z.array(z.string()).optional(),
      medications: z.array(z.string()).optional(),
    })
    .optional(),
});

export const navigatorRequestSchema = z.object({
  question: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  location: z
    .object({
      state: z.string().max(50).optional(),
      city: z.string().max(100).optional(),
    })
    .optional(),
});

const symptomEntrySchema = z.object({
  objectId: z.string().optional(),
  occurredAt: z.string(),
  createdAt: z.string().optional(),
  datePrecision: z.enum(["exact", "week", "month", "approximate"]),
  symptomCode: z.string(),
  symptomLabel: z.string(),
  severity: z.number().min(0).max(10),
  bodySite: z.string().optional(),
  durationMinutes: z.number().optional(),
  notes: z.string(),
  context: z.array(z.string()),
});

const functionEntrySchema = z.object({
  objectId: z.string().optional(),
  occurredAt: z.string(),
  domain: z.enum(["stairs", "work_hours", "driving", "cooking", "showering", "leaving_home"]),
  value: z.number(),
  note: z.string().optional(),
});

const timelineAnchorSchema = z.object({
  objectId: z.string().optional(),
  type: z.enum([
    "tick_bite",
    "rash_onset",
    "travel",
    "outdoor_exposure",
    "antibiotic_start",
    "antibiotic_end",
    "symptom_onset",
    "test_taken",
    "test_result",
    "personal_event",
  ]),
  occurredAt: z.string(),
  precision: z.enum(["exact", "week", "month", "approximate"]),
  detail: z.string(),
});

const clinicalEncounterSchema = z.object({
  objectId: z.string().optional(),
  occurredAt: z.string(),
  specialty: z.string(),
  toldWhat: z.string(),
  ruledOut: z.array(z.string()),
  testsOrdered: z.array(z.string()),
  treatmentsTried: z.array(z.string()),
});

export const journalAgentRequestSchema = z.object({
  question: z.string().min(1).max(1000),
  journalData: z.object({
    symptoms: z.array(symptomEntrySchema).max(2000),
    functionEntries: z.array(functionEntrySchema).max(2000),
    anchors: z.array(timelineAnchorSchema).max(500),
    encounters: z.array(clinicalEncounterSchema).max(500),
  }),
});

export const chatInsightsRequestSchema = z.object({
  conversations: z
    .array(
      z.object({
        title: z.string().max(200),
        createdAt: z.string(),
        messages: z
          .array(z.object({ role: z.string(), content: z.string().max(4000) }))
          .max(200),
      })
    )
    .max(100),
});

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}
