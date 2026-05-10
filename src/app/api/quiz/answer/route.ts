import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { card_id, user_answer, rating } = body as {
    card_id: string;
    user_answer?: string;
    rating: 1 | 2 | 3 | 4;
  };

  if (!card_id || !rating || rating < 1 || rating > 4) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? MOCK_USER_ID;

  const { error: reviewError } = await supabase.from("card_reviews").insert({
    user_id: userId,
    card_id,
    user_answer: user_answer || null,
    rating,
  });

  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 });
  }

  const daysMap: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 7 };
  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + daysMap[rating]);

  const { error: updateError } = await supabase
    .from("cards")
    .update({
      due: nextDue.toISOString(),
      last_review: new Date().toISOString(),
    })
    .eq("id", card_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, next_due: nextDue.toISOString() });
}
