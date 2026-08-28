// Deterministic disease/topic extraction over a patient's saved chat history
// (Parse "Conversation" records) -- the counterpart to lib/health-insights'
// pattern for HealthLog data, but for what the patient has been *asking
// about* rather than what they've logged. Topic vocabulary is scoped to
// disease/condition names actually referenced in lib/vocabulary-map.ts and
// lib/co-infection.ts, so this stays consistent with the rest of the app's
// terminology instead of inventing a parallel list.
//
// Counts are per-user-message (a question mentioning a topic twice still
// counts once) and are computed here, not by the LLM -- the API route feeds
// these numbers into the model as ground truth for its narrative, the same
// "don't invent a score" discipline as lib/evidence-tier.ts's
// computeEvidenceScore().

export interface ChatMessageLike {
  role: string;
  content: string;
}

export interface ConversationLike {
  title: string;
  createdAt: string;
  messages: ChatMessageLike[];
}

export interface TopicCount {
  name: string;
  count: number;
  conversationCount: number;
  firstAsked: string | null;
  lastAsked: string | null;
}

export interface ChatLogAnalysis {
  totalConversations: number;
  totalUserQuestions: number;
  dateRange: { earliest: string | null; latest: string | null };
  diseaseTopics: TopicCount[];
  otherTopics: TopicCount[];
}

const DISEASE_TOPICS: Record<string, string[]> = {
  "Lyme disease": ["lyme disease", "lyme", "borrelia"],
  "Babesiosis": ["babesiosis", "babesia"],
  "Anaplasmosis": ["anaplasmosis", "anaplasma"],
  "Ehrlichiosis": ["ehrlichiosis", "ehrlichia"],
  "Bartonella / cat scratch disease": ["bartonella", "bartonellosis", "cat scratch disease", "cat scratch fever"],
  "Lyme carditis": ["lyme carditis", "heart block"],
  "Neuroborreliosis": ["neuroborreliosis", "facial palsy", "bell's palsy", "bells palsy"],
  "Post-Treatment Lyme Disease Syndrome (PTLDS)": ["ptlds", "post-treatment lyme", "chronic lyme"],
};

const OTHER_TOPICS: Record<string, string[]> = {
  "Testing & diagnostics": ["elisa", "western blot", "seronegative", "false negative", "igm", "igg", "two-tier test", "antibody test"],
  "Tick exposure & prevention": ["tick bite", "tick exposure", "deer tick", "permethrin", "tick removal", "insect repellent"],
  "Treatment & antibiotics": ["doxycycline", "amoxicillin", "antibiotic", "antimicrobial"],
  "Coinfection concerns": ["coinfection", "co-infection", "other tick disease", "tick-borne"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface CompiledTopic {
  name: string;
  regexes: RegExp[];
}

function compileTopics(dict: Record<string, string[]>): CompiledTopic[] {
  return Object.entries(dict).map(([name, terms]) => ({
    name,
    regexes: terms.map((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`, "i")),
  }));
}

interface TrackerEntry {
  count: number;
  convIds: Set<number>;
  first: string | null;
  last: string | null;
}

function bump(tracker: Map<string, TrackerEntry>, name: string, convIdx: number, date: string) {
  const cur = tracker.get(name) ?? { count: 0, convIds: new Set<number>(), first: null, last: null };
  cur.count += 1;
  cur.convIds.add(convIdx);
  if (!cur.first || date < cur.first) cur.first = date;
  if (!cur.last || date > cur.last) cur.last = date;
  tracker.set(name, cur);
}

function toSorted(tracker: Map<string, TrackerEntry>): TopicCount[] {
  return [...tracker.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      conversationCount: v.convIds.size,
      firstAsked: v.first,
      lastAsked: v.last,
    }))
    .sort((a, b) => b.count - a.count);
}

export function analyzeConversationTopics(conversations: ConversationLike[]): ChatLogAnalysis {
  const diseaseTracker = new Map<string, TrackerEntry>();
  const otherTracker = new Map<string, TrackerEntry>();
  const diseaseTopics = compileTopics(DISEASE_TOPICS);
  const otherTopicsCompiled = compileTopics(OTHER_TOPICS);

  let totalUserQuestions = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  conversations.forEach((conv, convIdx) => {
    if (conv.createdAt) {
      if (!earliest || conv.createdAt < earliest) earliest = conv.createdAt;
      if (!latest || conv.createdAt > latest) latest = conv.createdAt;
    }
    conv.messages.forEach((msg) => {
      if (msg.role !== "user") return;
      totalUserQuestions += 1;
      for (const { name, regexes } of diseaseTopics) {
        if (regexes.some((re) => re.test(msg.content))) bump(diseaseTracker, name, convIdx, conv.createdAt);
      }
      for (const { name, regexes } of otherTopicsCompiled) {
        if (regexes.some((re) => re.test(msg.content))) bump(otherTracker, name, convIdx, conv.createdAt);
      }
    });
  });

  return {
    totalConversations: conversations.length,
    totalUserQuestions,
    dateRange: { earliest, latest },
    diseaseTopics: toSorted(diseaseTracker),
    otherTopics: toSorted(otherTracker),
  };
}

// Used when the LLM narrative call fails or returns nothing -- the report
// still has to show something coherent built entirely from the real counts
// above, since this can't silently degrade to an error during a demo.
export function fallbackNarrative(analysis: ChatLogAnalysis): string {
  if (analysis.totalConversations === 0) {
    return "No saved conversations yet — save a chat with Aura to start tracking what you've been asking about.";
  }
  const top = analysis.diseaseTopics
    .slice(0, 3)
    .map((t) => `${t.name} (${t.count} question${t.count === 1 ? "" : "s"})`)
    .join(", ");
  const convWord = analysis.totalConversations === 1 ? "conversation" : "conversations";
  if (!top) {
    return `Across ${analysis.totalConversations} saved ${convWord} (${analysis.totalUserQuestions} questions total), no specific disease names came up often enough yet to summarize. This is a summary of your own saved chats, not medical advice.`;
  }
  return `Across ${analysis.totalConversations} saved ${convWord} (${analysis.totalUserQuestions} questions total), the topics you've asked about most are: ${top}. This is a summary of your own saved chats, not medical advice.`;
}
