// Lay <-> clinical vocabulary mapping (ClearSignal build spec, section 6.2).
// STATUS: AI-seeded, NOT hand-verified. The spec is explicit that this needs a
// verification pass ("an unverified mapping is worse than none") — this is only
// the seed stage. Coverage is intentionally narrower than the spec's 200-400
// target (~45 entries) and scoped to terms that actually appear in this corpus's
// Lyme disease content, since a broader table with no real usage would just be
// unverified surface area.
//
// Used to expand retrieval queries before hybrid search: patients write "brain
// fog," the corpus says "cognitive dysfunction," and dense/BM25 search both do
// better with both forms present in the query.
export interface VocabularyEntry {
  lay: string[];
  clinical: string;
  icd10?: string | null;
}

export const VOCABULARY_MAP: VocabularyEntry[] = [
  { lay: ["brain fog", "foggy head", "can't think straight", "fuzzy thinking"], clinical: "cognitive dysfunction", icd10: "R41.840" },
  { lay: ["wiped out", "exhausted", "no energy", "drained", "worn out"], clinical: "fatigue", icd10: "R53.83" },
  { lay: ["pins and needles", "tingling", "numb feeling"], clinical: "paresthesia", icd10: "R20.2" },
  { lay: ["joints on fire", "achy joints", "joint pain that moves around", "joint pain that comes and goes"], clinical: "migratory arthralgia", icd10: "M25.50" },
  { lay: ["swollen joint", "puffy joint", "joint swelling"], clinical: "joint effusion", icd10: "M25.40" },
  { lay: ["bullseye rash", "bulls-eye rash", "target rash", "ring-shaped rash", "expanding rash"], clinical: "erythema migrans", icd10: "A69.20" },
  { lay: ["swollen glands", "swollen lymph nodes", "lumps in my neck"], clinical: "lymphadenopathy", icd10: "R59.9" },
  { lay: ["chills", "cold shivers"], clinical: "chills", icd10: "R68.83" },
  { lay: ["fever", "running a temperature", "hot and cold"], clinical: "fever", icd10: "R50.9" },
  { lay: ["muscle aches", "body aches", "sore all over"], clinical: "myalgia", icd10: "M79.10" },
  { lay: ["one side of my face drooping", "can't smile on one side", "face won't move on one side"], clinical: "facial palsy", icd10: "G51.0" },
  { lay: ["heart racing", "heart skipping beats", "irregular heartbeat", "heart flutter"], clinical: "cardiac arrhythmia", icd10: "I49.9" },
  { lay: ["heart problem from Lyme", "Lyme and my heart"], clinical: "Lyme carditis", icd10: "A69.21" },
  { lay: ["nerve problems", "nervous system stuff"], clinical: "neuroborreliosis", icd10: "A69.22" },
  { lay: ["headache that won't quit", "constant headache", "worst headache"], clinical: "cephalgia", icd10: "R51.9" },
  { lay: ["stiff neck", "can't move my neck"], clinical: "nuchal rigidity", icd10: "R29.1" },
  { lay: ["sensitive to light", "light hurts my eyes"], clinical: "photophobia", icd10: "H53.14" },
  { lay: ["can't sleep", "trouble sleeping", "sleep problems"], clinical: "insomnia", icd10: "G47.00" },
  { lay: ["blood test for Lyme", "Lyme test", "tick disease test"], clinical: "Lyme disease serology", icd10: null },
  { lay: ["first test", "screening test"], clinical: "ELISA", icd10: null },
  { lay: ["confirmation test", "second test"], clinical: "Western blot", icd10: null },
  { lay: ["antibodies", "immune response to the infection"], clinical: "IgM/IgG antibody response", icd10: null },
  { lay: ["antibiotics for Lyme", "Lyme medication", "Lyme pills"], clinical: "antimicrobial therapy", icd10: null },
  { lay: ["the yellow pill for Lyme", "doxy"], clinical: "doxycycline", icd10: null },
  { lay: ["amoxicillin"], clinical: "amoxicillin", icd10: null },
  { lay: ["tick bite", "got bit by a tick"], clinical: "tick exposure", icd10: "W57.XXXA" },
  { lay: ["deer tick", "black tick"], clinical: "blacklegged tick (Ixodes scapularis)", icd10: null },
  { lay: ["tick still attached", "tick stuck in my skin"], clinical: "tick attachment", icd10: null },
  { lay: ["tick spray", "bug spray for ticks"], clinical: "insect repellent (DEET/picaridin)", icd10: null },
  { lay: ["treated clothes", "permethrin clothes"], clinical: "permethrin-treated clothing", icd10: null },
  { lay: ["not treated in time", "left untreated", "didn't get treated early"], clinical: "untreated/late Lyme disease", icd10: "A69.29" },
  { lay: ["still sick after treatment", "symptoms after antibiotics", "not better after treatment"], clinical: "post-treatment Lyme disease syndrome (PTLDS)", icd10: null },
  { lay: ["chronic Lyme"], clinical: "post-treatment Lyme disease syndrome (PTLDS) / chronic Lyme disease (contested terminology)", icd10: null },
  { lay: ["night sweats", "soaked in sweat at night", "drenching sweats"], clinical: "diaphoresis (nocturnal)", icd10: "R61" },
  { lay: ["can't catch my breath", "air hunger", "short of breath for no reason"], clinical: "dyspnea", icd10: "R06.00" },
  { lay: ["low blood counts", "low platelets"], clinical: "cytopenia", icd10: "D75.9" },
  { lay: ["co-infection", "other tick disease"], clinical: "tick-borne co-infection (babesiosis/anaplasmosis)", icd10: null },
  { lay: ["dizzy", "lightheaded", "room spinning"], clinical: "dizziness/vertigo", icd10: "R42" },
  { lay: ["weak", "muscle weakness", "can't grip things"], clinical: "generalized weakness", icd10: "R53.1" },
  { lay: ["memory problems", "forgetting things"], clinical: "memory impairment", icd10: "R41.3" },
  { lay: ["mood swings", "irritable", "not myself emotionally"], clinical: "mood disturbance", icd10: "R45.89" },
  { lay: ["can't focus", "can't concentrate"], clinical: "impaired concentration", icd10: "R41.840" },
  { lay: ["stomach pain", "belly pain"], clinical: "abdominal pain", icd10: "R10.9" },
  { lay: ["confused", "not thinking clearly", "disoriented"], clinical: "confusion", icd10: "R41.0" },
  { lay: ["passed out", "fainted"], clinical: "syncope", icd10: "R55" },
];

// Appends the mapped clinical (or lay) term when a query contains its counterpart,
// so hybrid search sees both vocabularies. Deliberately additive, never replaces
// the user's own words — those still matter for BM25 exact-match and for keeping
// the query recognizable in logs/eval output.
export function expandQuery(query: string): string {
  const lower = query.toLowerCase();
  const additions = new Set<string>();

  for (const entry of VOCABULARY_MAP) {
    const layHit = entry.lay.some((term) => lower.includes(term.toLowerCase()));
    const clinicalHit = lower.includes(entry.clinical.toLowerCase());
    if (layHit && !clinicalHit) additions.add(entry.clinical);
    else if (clinicalHit && !layHit) additions.add(entry.lay[0]);
  }

  if (additions.size === 0) return query;
  return `${query} (${[...additions].join(", ")})`;
}
