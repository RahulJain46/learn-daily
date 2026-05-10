"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { getModel } from "@/lib/ai/gemini";
import { embedTexts, toPgvector } from "@/lib/ai/embeddings";

/**
 * Cosine similarity above which two questions are considered the same.
 * 0.92 is empirically conservative for `text-embedding-004`:
 *   - Paraphrases of the same question (e.g. "What is FSRS?" vs.
 *     "Explain the FSRS algorithm.") score ~0.93–0.97.
 *   - Genuinely different questions in the same topic score < 0.85.
 * Bumping this lower would suppress legitimate variations.
 */
const CARD_DEDUP_THRESHOLD = 0.92;

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

interface GeneratedCard {
  question_type: "mcq" | "short_answer" | "flashcard";
  question: string;
  options?: { text: string; isCorrect: boolean }[];
  answer: string;
}

export async function generateCardsFromEntry(
  entryId: string,
  count: number = 5
): Promise<{ success: boolean; count?: number; error?: string }> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .select("*")
    .eq("id", entryId)
    .single();

  if (entryError || !entry) {
    return { success: false, error: "Entry not found" };
  }

  let model;
  try {
    model = getModel("card_generation");
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI not configured";
    return { success: false, error: message };
  }

  const prompt = buildPrompt(entry, count);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    const cards = parseGeneratedCards(text);

    if (cards.length === 0) {
      return { success: false, error: "Failed to parse generated questions" };
    }

    // Embed every candidate question in one batch call. We need the
    // vectors twice — once to dedup against existing cards, and once to
    // store on the new rows so future generations dedup against THESE too.
    const embeddings = await embedTexts(
      cards.map((c) => c.question),
      "document"
    );

    // Dedup pass. For each candidate that has an embedding, ask the
    // match_cards_filtered RPC if the user already has a near-duplicate.
    // Cards without an embedding (rare — Gemini hiccup) skip dedup; better
    // to occasionally write a duplicate than to silently drop the card.
    const surviving: { card: GeneratedCard; embedding: number[] | null }[] = [];
    for (let i = 0; i < cards.length; i++) {
      const embedding = embeddings[i] ?? null;
      if (embedding) {
        const { data: hits } = await supabase.rpc("match_cards_filtered", {
          query_embedding: toPgvector(embedding),
          match_threshold: CARD_DEDUP_THRESHOLD,
          match_count: 1,
          filter_user_id: userId,
        });
        if (Array.isArray(hits) && hits.length > 0) {
          // Suppress this card silently; the user will see fewer cards but
          // no duplicates of questions they've already practiced.
          continue;
        }
      }
      surviving.push({ card: cards[i], embedding });
    }

    if (surviving.length === 0) {
      return { success: false, error: "All generated questions duplicate existing cards" };
    }

    const insertData = surviving.map(({ card, embedding }) => ({
      user_id: userId,
      entry_id: entryId,
      question_type: card.question_type,
      question: card.question,
      options: card.options || null,
      answer: card.answer,
      // pgvector serialised as a string — see embeddings.ts header.
      question_embedding: embedding ? toPgvector(embedding) : null,
    }));

    const { error: insertError } = await supabase
      .from("cards")
      .insert(insertData);

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    revalidatePath(`/entries/${entryId}`);
    return { success: true, count: surviving.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

function buildPrompt(
  entry: { title: string; content: string; category: string; subcategory: string | null; difficulty: string },
  count: number
): string {
  return `You are an expert interview preparation assistant. Generate ${count} interview-relevant revision questions based on the following study notes.

TOPIC: ${entry.title}
CATEGORY: ${entry.category}${entry.subcategory ? ` > ${entry.subcategory}` : ""}
DIFFICULTY: ${entry.difficulty}

CONTENT:
${entry.content}

Generate a mix of question types:
- 2 MCQ questions (multiple choice with 4 options, exactly 1 correct)
- ${Math.max(1, count - 3)} short_answer questions (concise 1-3 sentence answers expected)
- 1 flashcard (concept recall, brief answer)

Adjust complexity to match "${entry.difficulty}" difficulty level.
Focus on concepts that are commonly asked in technical interviews.

Respond ONLY with a JSON array. No markdown, no code fences, just pure JSON:
[
  {
    "question_type": "mcq",
    "question": "...",
    "options": [
      {"text": "...", "isCorrect": false},
      {"text": "...", "isCorrect": false},
      {"text": "...", "isCorrect": true},
      {"text": "...", "isCorrect": false}
    ],
    "answer": "Brief explanation of why the correct answer is right"
  },
  {
    "question_type": "short_answer",
    "question": "...",
    "answer": "Expected answer in 1-3 sentences"
  },
  {
    "question_type": "flashcard",
    "question": "...",
    "answer": "Brief concept explanation"
  }
]`;
}

function parseGeneratedCards(text: string): GeneratedCard[] {
  try {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter((card: GeneratedCard) => {
      if (!card.question || !card.answer || !card.question_type) return false;
      if (!["mcq", "short_answer", "flashcard"].includes(card.question_type))
        return false;
      if (card.question_type === "mcq") {
        if (!Array.isArray(card.options) || card.options.length < 2)
          return false;
        const correctCount = card.options.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}
