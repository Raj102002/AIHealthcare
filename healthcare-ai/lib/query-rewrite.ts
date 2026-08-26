import type Groq from "groq-sdk";
import { recordTokenUsage } from "@/lib/metrics";
import { GROQ_REWRITE_MODEL, GROQ_REASONING_EFFORT } from "@/lib/models";

const REWRITE_MODEL = GROQ_REWRITE_MODEL;
const HISTORY_TURNS = 3;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Rewrites the latest user message into a standalone search query using the last
// few turns of conversation, so follow-ups like "what about side effects?" retrieve
// against what they actually mean instead of retrieving on those three words alone.
export async function rewriteQuery(history: ChatTurn[], latestMessage: string, groq: Groq): Promise<string> {
  const recentHistory = history.slice(-HISTORY_TURNS * 2, -1);
  if (recentHistory.length === 0) return latestMessage;

  const transcript = recentHistory.map((t) => `${t.role}: ${t.content}`).join("\n");
  const prompt = `Conversation so far:
${transcript}

Latest user message: "${latestMessage}"

Rewrite the latest user message as a standalone search query that makes sense without the conversation history — resolve pronouns and implicit references (e.g. "what about side effects?" after a message about a specific drug becomes "side effects of <that drug>"). If the latest message is already standalone, return it unchanged. Respond with ONLY the rewritten query text, nothing else.`;

  try {
    const completion = await groq.chat.completions.create({
      model: REWRITE_MODEL,
      max_tokens: 220,
      reasoning_effort: GROQ_REASONING_EFFORT,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    if (completion.usage) {
      recordTokenUsage(completion.usage.prompt_tokens ?? 0, completion.usage.completion_tokens ?? 0);
    }
    const rewritten = completion.choices[0]?.message?.content?.trim();
    return rewritten || latestMessage;
  } catch {
    // Retrieval with the raw message is still better than failing the request.
    return latestMessage;
  }
}
