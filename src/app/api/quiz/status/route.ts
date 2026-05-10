import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";

/**
 * Lightweight status endpoint used by the notification scheduler in the
 * browser. Returns just enough information to decide whether to fire a
 * "due cards" or "streak save" reminder, without exposing card content.
 *
 * The popup quiz hits /api/quiz/random; this route is intentionally cheap
 * so the client can poll it on focus / on a slow interval.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? MOCK_USER_ID;

  const todayIso = new Date().toISOString().split("T")[0];

  // Count cards due now (cheap: head + count)
  const { count: cardsDue } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due", new Date().toISOString());

  // Profile holds streak + last_active_date — used for streak-save logic.
  const { data: profile } = await supabase
    .from("profiles")
    .select("streak_count, last_active_date")
    .eq("id", userId)
    .maybeSingle();

  // "Active today" = either profile.last_active_date is today, or the user
  // submitted any card review today. We check reviews because last_active_date
  // is only bumped when the dashboard mounts.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { count: reviewsToday } = await supabase
    .from("card_reviews")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("reviewed_at", startOfToday.toISOString());

  const lastActiveToday = profile?.last_active_date === todayIso;
  const activeToday = lastActiveToday || (reviewsToday ?? 0) > 0;

  return NextResponse.json({
    cardsDue: cardsDue ?? 0,
    streak: profile?.streak_count ?? 0,
    activeToday,
    reviewsToday: reviewsToday ?? 0,
    serverTime: new Date().toISOString(),
  });
}
