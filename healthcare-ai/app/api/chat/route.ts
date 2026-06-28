import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function buildSystemPrompt(profile?: {
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  age?: number;
  bloodType?: string;
}): string {
  let context = "";
  if (profile) {
    if (profile.age) context += `\n- Age: ${profile.age}`;
    if (profile.bloodType) context += `\n- Blood type: ${profile.bloodType}`;
    if (profile.allergies?.length)
      context += `\n- Known allergies: ${profile.allergies.join(", ")}`;
    if (profile.conditions?.length)
      context += `\n- Existing conditions: ${profile.conditions.join(", ")}`;
    if (profile.medications?.length)
      context += `\n- Current medications: ${profile.medications.join(", ")}`;
  }

  return `You are a compassionate and knowledgeable healthcare assistant. Your role is to provide general health information, wellness guidance, and support — NOT to diagnose or prescribe.

${context ? `USER HEALTH PROFILE:${context}\n` : ""}

CORE RULES — follow every single one:
1. NEVER diagnose medical conditions. Always recommend consulting a qualified healthcare professional.
2. NEVER prescribe medications or specific dosages.
3. Before giving any health guidance, ask 1-2 relevant follow-up questions to better understand the user's situation (e.g., duration, severity, associated symptoms, relevant history).
4. If you detect ANY of these emergency warning signs, start your ENTIRE response with the exact token [EMERGENCY] on its own line:
   - Chest pain, pressure, or tightness
   - Difficulty breathing or shortness of breath
   - Stroke signs: facial drooping, sudden arm weakness, speech difficulty, sudden severe headache
   - Suicidal thoughts, self-harm, or intent to harm others
   - Severe allergic reaction (throat closing, anaphylaxis)
   - Uncontrolled bleeding, loss of consciousness, seizure, overdose
5. When user health profile data is available, incorporate it into your responses (e.g., "Given your allergy to penicillin, you should mention this to your doctor").
6. Track symptoms mentioned across the conversation and reference them when relevant.
7. Recommend the appropriate type of specialist when relevant (e.g., cardiologist, dermatologist, neurologist).
8. End every substantive health response with: "⚕️ Please consult a healthcare professional for proper medical advice."
9. Be warm, empathetic, and clear — avoid overly technical jargon unless the user demonstrates medical knowledge.
10. For mental health topics, be especially compassionate and always mention professional support resources.

DISCLAIMER TO INCLUDE IN FIRST MESSAGE: Remind the user once that you provide general wellness information only and are not a substitute for professional medical care.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, userProfile } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      userProfile?: {
        allergies?: string[];
        conditions?: string[];
        medications?: string[];
        age?: number;
        bloodType?: string;
      };
    };

    if (!messages?.length) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(userProfile);

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
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
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
