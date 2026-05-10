import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import {
  Shuffle,
  Calendar,
  FolderOpen,
  ArrowRight,
  Clock,
  Layers,
  Zap,
} from "lucide-react";
import { getStats } from "@/lib/actions/sessions";
import { CATEGORY_CONFIG } from "@/lib/types";

export default async function RevisePage() {
  const stats = await getStats();

  const cardsDue = stats?.cardsDueToday ?? 0;
  const totalCards = stats?.totalCards ?? 0;
  const reviewed = stats?.reviewedThisWeek ?? 0;
  const accuracy = stats?.accuracy ?? 0;

  const modes = [
    {
      id: "due",
      title: "Due Today",
      description: "Cards scheduled by spaced repetition. Best for long-term retention.",
      icon: Calendar,
      count: cardsDue,
      badge: "Recommended",
      badgeColor: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    },
    {
      id: "random",
      title: "Random Mix",
      description: "Random questions from all your entries. Good for quick recall check.",
      icon: Shuffle,
      count: totalCards,
      badge: null,
      badgeColor: "",
    },
    {
      id: "topic",
      title: "Topic Wise",
      description: "Focus on a specific category — DSA, System Design, or Concepts.",
      icon: FolderOpen,
      count: null,
      badge: null,
      badgeColor: "",
    },
    {
      id: "flashcard",
      title: "Flashcards",
      description: "Flip cards to reveal key concepts and learnings. Great for quick recall.",
      icon: Layers,
      count: null,
      badge: null,
      badgeColor: "",
    },
    {
      id: "quick-quiz",
      title: "Quick Quiz",
      description: "One random question at a time. No session, no pressure — just practice.",
      icon: Zap,
      count: null,
      badge: "New",
      badgeColor: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revise</h1>
        <p className="text-muted-foreground">
          Choose a revision mode to start your session.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="flex items-center gap-4 p-4 rounded-lg bg-accent/50 border border-border">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <div className="text-sm">
          <span className="font-medium">{cardsDue} cards</span>{" "}
          due today &middot;{" "}
          <span className="font-medium">{reviewed} reviewed</span>{" "}
          this week &middot;{" "}
          <span className="font-medium">{accuracy}%</span> accuracy
        </div>
      </div>

      {/* Mode Selection */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {modes.map((mode) => (
          <Link key={mode.id} href={mode.id === "flashcard" ? "/revise/flashcards" : mode.id === "quick-quiz" ? "/revise/quick-quiz" : `/revise/session?mode=${mode.id}`}>
            <Card className="h-full hover:bg-accent/50 transition-colors cursor-pointer group">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <mode.icon className="h-5 w-5 text-primary" />
                  </div>
                  {mode.badge && (
                    <Badge variant="secondary" className={mode.badgeColor}>
                      {mode.badge}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg mt-3">{mode.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {mode.description}
                </p>
                {mode.count !== null && (
                  <p className="text-sm font-medium">{mode.count} cards available</p>
                )}
                <div className="flex items-center text-sm font-medium text-primary group-hover:translate-x-1 transition-transform">
                  Start Session
                  <ArrowRight className="ml-1 h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Topic Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Topic Start</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <LinkButton
                key={key}
                href={`/revise/session?mode=topic&category=${key}`}
                variant="outline"
              >
                <span className={`h-2 w-2 rounded-full mr-2 ${config.color.split(" ")[0]}`} />
                {config.label}
              </LinkButton>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
