import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  let query = supabase
    .from("cards")
    .select("id, question_type, question, options, answer, entry_id");

  if (category) {
    const { data: entries } = await supabase
      .from("entries")
      .select("id")
      .eq("category", category);
    const entryIds = entries?.map((e) => e.id) || [];
    if (entryIds.length > 0) {
      query = query.in("entry_id", entryIds);
    } else {
      return NextResponse.json({ card: null });
    }
  }

  const { data: cards, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!cards || cards.length === 0) {
    return NextResponse.json({ card: null });
  }

  const randomCard = cards[Math.floor(Math.random() * cards.length)];
  return NextResponse.json({ card: randomCard });
}
