"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LinkButton } from "@/components/ui/link-button";
import { Calendar, Target, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_CONFIG } from "@/lib/types";

interface UpcomingInterview {
  id: string;
  company: string;
  role: string;
  interview_date: string;
  topics: string[];
}

interface TopicProgress {
  topic: string;
  label: string;
  totalCards: number;
  dueCards: number;
  reviewedRecently: number;
}

export function PrepPlan() {
  const [interview, setInterview] = useState<UpcomingInterview | null>(null);
  const [topicProgress, setTopicProgress] = useState<TopicProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrepData();
  }, []);

  const loadPrepData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

    const today = new Date().toISOString().split("T")[0];
    const { data: upcoming } = await supabase
      .from("interview_log")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "upcoming")
      .gte("interview_date", today)
      .order("interview_date", { ascending: true })
      .limit(1);

    if (!upcoming || upcoming.length === 0) {
      setLoading(false);
      return;
    }

    const nextInterview = upcoming[0] as UpcomingInterview;
    setInterview(nextInterview);

    // Get progress for each topic
    const progress: TopicProgress[] = [];
    for (const topic of nextInterview.topics) {
      const { data: entries } = await supabase
        .from("entries")
        .select("id")
        .eq("category", topic);

      const entryIds = entries?.map((e) => e.id) || [];

      if (entryIds.length === 0) {
        progress.push({
          topic,
          label: CATEGORY_CONFIG[topic as keyof typeof CATEGORY_CONFIG]?.label ?? topic,
          totalCards: 0,
          dueCards: 0,
          reviewedRecently: 0,
        });
        continue;
      }

      const { count: totalCards } = await supabase
        .from("cards")
        .select("*", { count: "exact", head: true })
        .in("entry_id", entryIds);

      const { count: dueCards } = await supabase
        .from("cards")
        .select("*", { count: "exact", head: true })
        .in("entry_id", entryIds)
        .lte("due", new Date().toISOString());

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: reviewedRecently } = await supabase
        .from("card_reviews")
        .select("*, cards!inner(entry_id)", { count: "exact", head: true })
        .in("cards.entry_id", entryIds)
        .gte("reviewed_at", weekAgo.toISOString());

      progress.push({
        topic,
        label: CATEGORY_CONFIG[topic as keyof typeof CATEGORY_CONFIG]?.label ?? topic,
        totalCards: totalCards || 0,
        dueCards: dueCards || 0,
        reviewedRecently: reviewedRecently || 0,
      });
    }

    setTopicProgress(progress);
    setLoading(false);
  };

  if (loading) return null;
  if (!interview) return null;

  const daysUntil = Math.ceil(
    (new Date(interview.interview_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const dailyTarget = topicProgress.reduce((sum, t) => sum + t.dueCards, 0);
  const suggestedDaily = daysUntil > 0
    ? Math.max(5, Math.ceil(dailyTarget / daysUntil))
    : dailyTarget;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Prep Plan</CardTitle>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `${daysUntil} days left`}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-medium">{interview.company}</span> — {interview.role}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Daily Target */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
          <Target className="h-5 w-5 text-primary shrink-0" />
          <div className="text-sm">
            <span className="font-medium">Daily target:</span> Review at least{" "}
            <span className="font-bold text-primary">{suggestedDaily} cards</span> per day
          </div>
        </div>

        {/* Topic Progress */}
        <div className="space-y-3">
          {topicProgress.map((tp) => {
            const coverage = tp.totalCards > 0
              ? Math.round((tp.reviewedRecently / tp.totalCards) * 100)
              : 0;
            return (
              <div key={tp.topic}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{tp.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {tp.dueCards} due &middot; {tp.reviewedRecently}/{tp.totalCards} reviewed this week
                  </span>
                </div>
                <Progress value={Math.min(coverage, 100)} className="h-2" />
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          {topicProgress
            .filter((tp) => tp.dueCards > 0)
            .slice(0, 2)
            .map((tp) => (
              <LinkButton
                key={tp.topic}
                href={`/revise/session?mode=topic&category=${tp.topic}`}
                variant="outline"
                size="sm"
              >
                Revise {tp.label}
                <ArrowRight className="ml-1 h-3 w-3" />
              </LinkButton>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
