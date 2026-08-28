// Demo-only seed data for tomorrow's showcase. Builds a coherent, realistic
// patient narrative (tick exposure -> EM rash -> early treatment -> lingering
// post-treatment symptoms -> coinfection workup) across every persisted data
// model the app has: HealthLog, the Journal's SymptomEntry/FunctionEntry/
// TimelineAnchor/ClinicalEncounter, and saved Conversations.
//
// Two real constraints from the data model shape what's here:
// 1. SymptomEntry/FunctionEntry/TimelineAnchor/ClinicalEncounter all have a
//    real, client-settable `occurredAt`, so those get spread across ~10
//    weeks of backdated history. HealthLog and Conversation only have
//    Parse's own `createdAt` (server-assigned, not settable from the client
//    SDK), so those will all show today's date regardless -- there's no
//    "TestResult" Parse class in this codebase, so lab-report content lives
//    in TimelineAnchor entries of type test_taken/test_result instead of a
//    class that doesn't exist.
// 2. SymptomEntry.notes is encrypted client-side (lib/client-crypto.ts)
//    against a key that lives only in this browser's localStorage, so this
//    has to run through lib/journal-client.ts's real save functions in an
//    actual browser session (not a Node/REST seed script) or the notes
//    would never be decryptable in the demo browser.
import {
  saveHealthLog,
  saveConversation,
} from "@/lib/parse-client";
import {
  saveSymptomEntry,
  saveFunctionEntry,
  saveTimelineAnchor,
  saveClinicalEncounter,
} from "@/lib/journal-client";
import type { DatePrecision, FunctionDomain, AnchorType } from "@/types/journal";

function daysAgoIso(days: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ---- SymptomEntry seed rows ----
const SYMPTOMS: {
  daysAgo: number;
  datePrecision: DatePrecision;
  symptomCode: string;
  symptomLabel: string;
  severity: number;
  bodySite?: string;
  durationMinutes?: number;
  notes: string;
  context: string[];
}[] = [
  { daysAgo: 61, datePrecision: "exact", symptomCode: "fever", symptomLabel: "Fever", severity: 6, notes: "101.4°F this morning, chills overnight.", context: ["morning"] },
  { daysAgo: 61, datePrecision: "exact", symptomCode: "fatigue", symptomLabel: "Wiped out, no energy", severity: 7, notes: "Could barely get off the couch today.", context: ["all day"] },
  { daysAgo: 60, datePrecision: "exact", symptomCode: "cephalgia", symptomLabel: "Constant headache", severity: 5, bodySite: "head", notes: "Dull ache behind the eyes, worse with light.", context: ["afternoon"] },
  { daysAgo: 59, datePrecision: "exact", symptomCode: "myalgia", symptomLabel: "Body aches", severity: 6, notes: "Sore all over, like I have the flu.", context: ["all day"] },
  { daysAgo: 58, datePrecision: "exact", symptomCode: "fatigue", symptomLabel: "Exhausted", severity: 6, notes: "Slept 10 hours, still tired.", context: ["morning"] },
  { daysAgo: 54, datePrecision: "exact", symptomCode: "migratory_arthralgia", symptomLabel: "Joint pain that moves around", severity: 5, bodySite: "knees, then wrists", durationMinutes: 240, notes: "Started in my left knee, now my wrists hurt too.", context: ["afternoon", "evening"] },
  { daysAgo: 51, datePrecision: "exact", symptomCode: "migratory_arthralgia", symptomLabel: "Joint pain, now in my shoulder", severity: 4, bodySite: "shoulder", notes: "Moved again — shoulder today, knee feels a little better.", context: [] },
  { daysAgo: 47, datePrecision: "exact", symptomCode: "cognitive_dysfunction", symptomLabel: "Brain fog", severity: 5, notes: "Kept losing my train of thought in a work meeting.", context: ["work"] },
  { daysAgo: 46, datePrecision: "exact", symptomCode: "paresthesia", symptomLabel: "Tingling in my hands", severity: 3, bodySite: "hands", notes: "Pins and needles feeling, comes and goes.", context: ["evening"] },
  { daysAgo: 40, datePrecision: "exact", symptomCode: "fatigue", symptomLabel: "Still exhausted despite finishing antibiotics", severity: 6, notes: "Finished the doxycycline course but I don't feel back to normal.", context: ["all day"] },
  { daysAgo: 39, datePrecision: "exact", symptomCode: "migratory_arthralgia", symptomLabel: "Achy joints", severity: 4, bodySite: "knees", notes: "Not as sharp as before, more of a dull ache now.", context: [] },
  { daysAgo: 35, datePrecision: "approximate", symptomCode: "dizziness_vertigo", symptomLabel: "Lightheaded when standing up", severity: 3, notes: "Room spun for a few seconds getting out of bed.", context: ["morning"] },
  { daysAgo: 28, datePrecision: "exact", symptomCode: "migratory_arthralgia", symptomLabel: "Joint pain flare", severity: 6, bodySite: "knees, ankles", notes: "Worse this week — brought it up with the rheumatologist.", context: ["evening"] },
  { daysAgo: 21, datePrecision: "exact", symptomCode: "diaphoresis_nocturnal", symptomLabel: "Drenching night sweats", severity: 5, notes: "Woke up twice to change my shirt.", context: ["night"] },
  { daysAgo: 20, datePrecision: "exact", symptomCode: "cardiac_arrhythmia", symptomLabel: "Heart racing / skipping beats", severity: 4, notes: "Noticed my heart flutter while just sitting at my desk. A little scary.", context: ["afternoon"] },
  { daysAgo: 14, datePrecision: "exact", symptomCode: "cognitive_dysfunction", symptomLabel: "Brain fog, hard to focus", severity: 4, notes: "Reread the same email three times before it made sense.", context: ["work"] },
  { daysAgo: 13, datePrecision: "exact", symptomCode: "fatigue", symptomLabel: "Low energy", severity: 4, notes: "Better than a month ago but still not back to baseline.", context: [] },
  { daysAgo: 7, datePrecision: "exact", symptomCode: "insomnia", symptomLabel: "Trouble sleeping", severity: 3, notes: "Wired but tired — took a while to fall asleep.", context: ["night"] },
  { daysAgo: 3, datePrecision: "exact", symptomCode: "migratory_arthralgia", symptomLabel: "Mild knee ache", severity: 2, bodySite: "knee", notes: "Barely noticeable today, mostly when climbing stairs.", context: [] },
  { daysAgo: 1, datePrecision: "exact", symptomCode: "fatigue", symptomLabel: "Slightly tired", severity: 2, notes: "A better day overall.", context: [] },
];

// ---- FunctionEntry seed rows ----
const FUNCTION_ENTRIES: { daysAgo: number; domain: FunctionDomain; value: number; note?: string }[] = [
  { daysAgo: 61, domain: "work_hours", value: 2, note: "Left early, couldn't focus." },
  { daysAgo: 60, domain: "leaving_home", value: 0, note: "Didn't leave the house." },
  { daysAgo: 59, domain: "showering", value: 1 },
  { daysAgo: 54, domain: "stairs", value: 0, note: "Knee too painful." },
  { daysAgo: 50, domain: "work_hours", value: 4 },
  { daysAgo: 46, domain: "cooking", value: 0, note: "Ordered in again." },
  { daysAgo: 40, domain: "work_hours", value: 5 },
  { daysAgo: 35, domain: "driving", value: 1, note: "Felt lightheaded, kept trip short." },
  { daysAgo: 28, domain: "stairs", value: 0, note: "Joint flare made stairs painful again." },
  { daysAgo: 21, domain: "work_hours", value: 6 },
  { daysAgo: 14, domain: "cooking", value: 1 },
  { daysAgo: 7, domain: "work_hours", value: 7 },
  { daysAgo: 3, domain: "stairs", value: 1, note: "Manageable today." },
  { daysAgo: 1, domain: "work_hours", value: 8 },
];

// ---- TimelineAnchor seed rows ----
const ANCHORS: { daysAgo: number; type: AnchorType; precision: DatePrecision; detail: string }[] = [
  { daysAgo: 70, type: "outdoor_exposure", precision: "exact", detail: "Weekend hiking trip through tall grass and wooded trail, Shenandoah National Park." },
  { daysAgo: 68, type: "tick_bite", precision: "exact", detail: "Found an embedded tick on lower left leg after the hike; removed with tweezers. Estimated attachment time 30-36 hours." },
  { daysAgo: 63, type: "rash_onset", precision: "exact", detail: "Expanding red rash appeared at the bite site, roughly 4 inches across by day 5, warm to the touch, not itchy." },
  { daysAgo: 62, type: "symptom_onset", precision: "exact", detail: "Fever, chills, headache, fatigue, and body aches began — felt like a bad flu." },
  { daysAgo: 56, type: "test_taken", precision: "exact", detail: "Blood draw for two-tier Lyme testing (ELISA + Western blot) at primary care visit." },
  { daysAgo: 54, type: "antibiotic_start", precision: "exact", detail: "Started doxycycline 100mg twice daily, 21-day course." },
  { daysAgo: 49, type: "test_result", precision: "exact", detail: "ELISA: Positive. Western blot IgM: 3/3 bands positive (23kDa, 39kDa, 41kDa) — meets CDC surveillance criteria for early Lyme disease." },
  { daysAgo: 33, type: "antibiotic_end", precision: "exact", detail: "Completed the 21-day doxycycline course." },
  { daysAgo: 16, type: "test_taken", precision: "exact", detail: "Coinfection panel drawn (Babesia microti PCR, Anaplasma phagocytophilum PCR/serology) after night sweats and heart palpitations." },
  { daysAgo: 11, type: "test_result", precision: "exact", detail: "Babesia microti PCR: Negative. Anaplasma phagocytophilum PCR/serology: Negative." },
];

// ---- ClinicalEncounter seed rows ----
const ENCOUNTERS: {
  daysAgo: number;
  specialty: string;
  toldWhat: string;
  ruledOut: string[];
  testsOrdered: string[];
  treatmentsTried: string[];
}[] = [
  {
    daysAgo: 56,
    specialty: "Primary Care",
    toldWhat: "Likely early Lyme disease based on the expanding rash and known tick exposure — started treatment without waiting on test results.",
    ruledOut: [],
    testsOrdered: ["ELISA", "Western blot"],
    treatmentsTried: ["Doxycycline 100mg twice daily, 21 days"],
  },
  {
    daysAgo: 28,
    specialty: "Rheumatology",
    toldWhat: "Post-infectious inflammatory arthralgia; no current evidence of an autoimmune disease, but will monitor.",
    ruledOut: ["Rheumatoid arthritis", "Lupus"],
    testsOrdered: ["ANA", "Rheumatoid factor", "ESR", "CRP"],
    treatmentsTried: ["Ibuprofen as needed"],
  },
  {
    daysAgo: 10,
    specialty: "Infectious Disease (follow-up)",
    toldWhat: "Symptoms are consistent with post-treatment Lyme disease syndrome (PTLDS); coinfection panel came back negative, so no additional antibiotics recommended right now.",
    ruledOut: ["Babesiosis", "Anaplasmosis"],
    testsOrdered: ["Babesia microti PCR", "Anaplasma phagocytophilum PCR/serology"],
    treatmentsTried: ["Doxycycline (completed prior course)", "Physical therapy referral"],
  },
];

// ---- HealthLog seed rows (dashboard "Health Logs" card) ----
// createdAt isn't client-settable via the Parse JS SDK, so these will all
// show today's date on the dashboard regardless of the narrative above —
// flagged in the seed page's own UI copy rather than silently pretending
// otherwise.
const HEALTH_LOGS: {
  symptoms: string;
  severity: "low" | "medium" | "high";
  notes: string;
  vitals: { heartRate?: number; bloodPressure?: string; temperature?: number; oxygenSaturation?: number; weight?: number };
}[] = [
  { symptoms: "Fatigue, low-grade fever", severity: "high", notes: "Started right after the hiking trip.", vitals: { heartRate: 92, bloodPressure: "124/80", temperature: 100.6, oxygenSaturation: 97 } },
  { symptoms: "Migratory joint pain, headache", severity: "medium", notes: "Knee this week, wrist last week.", vitals: { heartRate: 84, bloodPressure: "118/76", temperature: 99.1, oxygenSaturation: 98 } },
  { symptoms: "Brain fog, hard to concentrate at work", severity: "medium", notes: "Reread the same paragraph four times.", vitals: { heartRate: 80, bloodPressure: "116/74", temperature: 98.7, oxygenSaturation: 98 } },
  { symptoms: "Night sweats, heart palpitations", severity: "high", notes: "Woke up twice overnight. A little scary.", vitals: { heartRate: 98, bloodPressure: "122/78", temperature: 99.3, oxygenSaturation: 97 } },
  { symptoms: "Mild joint ache, otherwise okay", severity: "low", notes: "Manageable today, mostly on stairs.", vitals: { heartRate: 76, bloodPressure: "114/72", temperature: 98.4, oxygenSaturation: 99 } },
  { symptoms: "Low energy, slept most of the afternoon", severity: "medium", notes: "Still not back to my normal baseline.", vitals: { heartRate: 82, bloodPressure: "118/78", temperature: 98.6, oxygenSaturation: 98 } },
  { symptoms: "Trouble sleeping, wired but tired", severity: "low", notes: "Took a while to fall asleep.", vitals: { heartRate: 78, bloodPressure: "116/76", temperature: 98.5, oxygenSaturation: 98 } },
  { symptoms: "Feeling mostly normal today", severity: "low", notes: "Best day in a couple weeks.", vitals: { heartRate: 72, bloodPressure: "112/70", temperature: 98.2, oxygenSaturation: 99 } },
];

// ---- Saved Conversations (chat history — feeds the Analyze My Logs demo) ----
const CONVERSATIONS: { title: string; messages: { role: "user" | "assistant"; content: string }[] }[] = [
  {
    title: "Understanding my positive Lyme test",
    messages: [
      { role: "user", content: "My ELISA came back positive and the Western blot showed 3 out of 3 IgM bands. What does that actually mean?" },
      { role: "assistant", content: "A positive ELISA followed by a positive IgM Western blot (2 or more of the 3 bands: 23, 39, and 41 kDa) meets the CDC's two-tier surveillance criteria for early Lyme disease. IgM antibodies typically appear first, within a few weeks of infection, which lines up with an early-stage diagnosis. This isn't a diagnosis from me — your clinician interprets the result alongside your symptoms and exposure history — but the pattern you're describing is consistent with what CDC guidance calls a positive two-tier result." },
      { role: "user", content: "Should I be worried the antibiotics won't work since I already have symptoms?" },
      { role: "assistant", content: "Doxycycline is the CDC-recommended first-line treatment for early Lyme disease and is effective even after symptoms have started — early treatment is specifically what it's for. Most people improve within days to a few weeks of starting the full course. If symptoms persist well after finishing treatment, that's worth flagging to your clinician, but starting antibiotics promptly is the right step. This is general information, not medical advice." },
    ],
  },
  {
    title: "Should I be worried about babesiosis?",
    messages: [
      { role: "user", content: "I've had drenching night sweats and my heart feels like it's racing sometimes. Could this be babesiosis on top of the Lyme diagnosis?" },
      { role: "assistant", content: "Night sweats and heart palpitations can be associated with babesiosis, a tick-borne coinfection caused by the parasite Babesia microti that's carried by the same tick species as Lyme disease. It doesn't always show up with a Lyme diagnosis, but co-infection is a recognized possibility when you were exposed to ticks in an endemic area. I can't tell you whether you have it — that requires a specific Babesia PCR or blood smear test — but these symptoms are a reasonable reason to ask your clinician for a coinfection panel." },
      { role: "user", content: "What about anaplasmosis — is that a different test?" },
      { role: "assistant", content: "Yes, anaplasmosis is caused by a different organism (Anaplasma phagocytophilum) and is usually tested with its own PCR or serology panel, separate from the Babesia test. Both are transmitted by the same blacklegged tick that transmits Lyme disease, so it's common for clinicians to test for both together when there's a suspected coinfection. Worth asking your clinician to order both if they haven't already." },
    ],
  },
  {
    title: "What does PTLDS / chronic Lyme mean?",
    messages: [
      { role: "user", content: "I finished my full course of doxycycline three weeks ago but I'm still exhausted and my joints still hurt. Is this chronic Lyme?" },
      { role: "assistant", content: "What you're describing — fatigue, joint pain, or cognitive symptoms that persist for more than 6 months after completing appropriate antibiotic treatment — is what the CDC refers to as Post-Treatment Lyme Disease Syndrome (PTLDS). \"Chronic Lyme disease\" is a more contested term without a standardized clinical definition, so different clinicians use it differently. At three weeks out, some lingering symptoms during recovery aren't unusual, but it's worth tracking how you feel and flagging it to your clinician if it continues." },
      { role: "user", content: "Is there a treatment for PTLDS or do I just wait it out?" },
      { role: "assistant", content: "There's no CDC-endorsed treatment specific to PTLDS, and extended or repeated antibiotic courses haven't been shown to help in controlled studies — the current guidance focuses on managing individual symptoms (like pain or fatigue) and monitoring over time rather than more antibiotics. This is exactly the kind of question worth bringing to an infectious disease specialist, since management is individualized. This is general information, not medical advice." },
    ],
  },
  {
    title: "Doxycycline dosing and side effect questions",
    messages: [
      { role: "user", content: "I'm on doxycycline 100mg twice a day for the Lyme diagnosis. Is it normal to feel nauseous after taking it?" },
      { role: "assistant", content: "Nausea and stomach upset are commonly reported with doxycycline, and taking it with food (avoiding dairy and antacids, which can reduce absorption) often helps. Photosensitivity is another common side effect, so sun protection is worth keeping in mind during the course. If the nausea is severe or you can't keep the medication down, that's worth calling your prescriber about rather than skipping doses on your own." },
      { role: "user", content: "How long until I should expect to feel better?" },
      { role: "assistant", content: "Many people start noticing improvement within a few days to two weeks of starting doxycycline for early Lyme disease, though full symptom resolution can take longer, especially for joint pain or fatigue. Finishing the entire prescribed course, even once you feel better, matters for fully clearing the infection." },
    ],
  },
  {
    title: "Tick bite prevention for a family camping trip",
    messages: [
      { role: "user", content: "We're planning a camping trip and I obviously want to avoid another tick bite. What actually works for prevention?" },
      { role: "assistant", content: "The CDC recommends a few concrete steps: use an EPA-registered insect repellent (DEET, picaridin, or IR3535) on skin, treat clothing and gear with permethrin, stick to trail centers away from tall grass and leaf litter, and do a full-body tick check (including scalp and behind ears) within a couple hours of coming indoors. Showering within two hours of being outdoors also helps wash off unattached ticks." },
      { role: "user", content: "If we find one attached, what's the right way to remove it?" },
      { role: "assistant", content: "Use fine-tipped tweezers, grasp the tick as close to the skin as possible, and pull straight up with steady, even pressure — avoid twisting or crushing it. Clean the bite area afterward with rubbing alcohol or soap and water. The CDC doesn't recommend home remedies like petroleum jelly or heat to remove a tick, since they can cause it to release more saliva into the bite." },
    ],
  },
  {
    title: "Anaplasmosis vs Lyme — how do the symptoms differ?",
    messages: [
      { role: "user", content: "How would I know if what I'm feeling is Lyme disease versus anaplasmosis? The symptoms sound similar." },
      { role: "assistant", content: "There's real overlap — both can cause fever, chills, headache, and muscle aches early on. A few things can point toward one or the other: Lyme disease often (though not always) starts with the expanding erythema migrans rash, which anaplasmosis typically doesn't cause. Anaplasmosis can also cause low white blood cell or platelet counts on routine bloodwork, which isn't typical of early Lyme disease. Definitive differentiation usually needs specific testing rather than symptoms alone." },
    ],
  },
  {
    title: "Bell's palsy and Lyme — could this be neuroborreliosis?",
    messages: [
      { role: "user", content: "A friend mentioned Lyme disease can sometimes cause facial palsy. Is that something I should be watching for?" },
      { role: "assistant", content: "Yes — facial palsy (sometimes called Bell's palsy when the cause is unclear) is a recognized presentation of neuroborreliosis, a form of Lyme disease that affects the nervous system. It can appear on its own or alongside other neurological symptoms like severe headache or neck stiffness. If you notice sudden facial drooping or weakness on one side, that's worth same-day medical attention rather than waiting, since it can also be a sign of other conditions like stroke that need urgent evaluation." },
    ],
  },
];

export interface SeedProgress {
  label: string;
  ok: boolean;
  error?: string;
}

export async function runDemoSeed(onProgress: (p: SeedProgress) => void): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      ok += 1;
      onProgress({ label, ok: true });
    } catch (err) {
      fail += 1;
      onProgress({ label, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const s of SYMPTOMS) {
    await run(`Symptom: ${s.symptomLabel}`, () =>
      saveSymptomEntry({
        occurredAt: daysAgoIso(s.daysAgo),
        datePrecision: s.datePrecision,
        symptomCode: s.symptomCode,
        symptomLabel: s.symptomLabel,
        severity: s.severity,
        bodySite: s.bodySite,
        durationMinutes: s.durationMinutes,
        notes: s.notes,
        context: s.context,
      })
    );
  }

  for (const f of FUNCTION_ENTRIES) {
    await run(`Function: ${f.domain}`, () =>
      saveFunctionEntry({ occurredAt: daysAgoIso(f.daysAgo), domain: f.domain, value: f.value, note: f.note })
    );
  }

  for (const a of ANCHORS) {
    await run(`Anchor: ${a.type}`, () =>
      saveTimelineAnchor({ occurredAt: daysAgoIso(a.daysAgo), type: a.type, precision: a.precision, detail: a.detail })
    );
  }

  for (const e of ENCOUNTERS) {
    await run(`Encounter: ${e.specialty}`, () =>
      saveClinicalEncounter({
        occurredAt: daysAgoIso(e.daysAgo),
        specialty: e.specialty,
        toldWhat: e.toldWhat,
        ruledOut: e.ruledOut,
        testsOrdered: e.testsOrdered,
        treatmentsTried: e.treatmentsTried,
      })
    );
  }

  for (const h of HEALTH_LOGS) {
    await run(`Health log: ${h.symptoms}`, () =>
      saveHealthLog({ symptoms: h.symptoms, severity: h.severity, notes: h.notes, vitals: h.vitals })
    );
  }

  for (const c of CONVERSATIONS) {
    await run(`Conversation: ${c.title}`, () => saveConversation({ title: c.title, messages: c.messages }));
  }

  return { ok, fail };
}

export const SEED_COUNTS = {
  symptoms: SYMPTOMS.length,
  functionEntries: FUNCTION_ENTRIES.length,
  anchors: ANCHORS.length,
  encounters: ENCOUNTERS.length,
  healthLogs: HEALTH_LOGS.length,
  conversations: CONVERSATIONS.length,
};
