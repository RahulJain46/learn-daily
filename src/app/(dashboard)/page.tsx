import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LinkButton } from "@/components/ui/link-button";
import {
  Flame,
  Target,
  TrendingUp,
  BookOpen,
  ArrowRight,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { getEntries } from "@/lib/actions/entries";
import { getStats, updateStreak } from "@/lib/actions/sessions";
import { CATEGORY_CONFIG } from "@/lib/types";
import { PrepPlan } from "@/components/interviews/prep-plan";
import { GapTeaser } from "@/components/gaps/gap-teaser";
import { WeeklySummaryWidget } from "@/components/notes/weekly-summary-widget";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
  tone: "violet" | "blue" | "emerald" | "amber";
};

const toneStyles: Record<
  StatCardProps["tone"],
  { tile: string; icon: string; ring: string }
> = {
  violet: {
    tile: "bg-violet-500/10 dark:bg-violet-500/15",
    icon: "text-violet-600 dark:text-violet-300",
    ring: "ring-violet-500/20",
  },
  blue: {
    tile: "bg-sky-500/10 dark:bg-sky-500/15",
    icon: "text-sky-600 dark:text-sky-300",
    ring: "ring-sky-500/20",
  },
  emerald: {
    tile: "bg-emerald-500/10 dark:bg-emerald-500/15",
    icon: "text-emerald-600 dark:text-emerald-300",
    ring: "ring-emerald-500/20",
  },
  amber: {
    tile: "bg-amber-500/10 dark:bg-amber-500/15",
    icon: "text-amber-600 dark:text-amber-300",
    ring: "ring-amber-500/20",
  },
};

function StatCard({ label, value, icon: Icon, trend, tone }: StatCardProps) {
  const styles = toneStyles[tone];
  return (
    <Card className="group">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {label}
            </p>
            <p className="text-[34px] font-semibold tracking-tight tabular-nums leading-none">
              {value}
            </p>
            {trend && (
              <p className="text-[13px] text-muted-foreground">{trend}</p>
            )}
          </div>
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-105",
              styles.tile,
              styles.ring
            )}
          >
            <Icon className={cn("h-[22px] w-[22px]", styles.icon)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [entries, stats] = await Promise.all([
    getEntries(),
    getStats(),
  ]);

  await updateStreak();

  const streak = stats?.streak ?? 0;
  const cardsDueToday = stats?.cardsDueToday ?? 0;
  const accuracy = stats?.accuracy ?? 0;
  const totalEntries = stats?.totalEntries ?? 0;
  const reviewedThisWeek = stats?.reviewedThisWeek ?? 0;
  const correctThisWeek = stats?.correctThisWeek ?? 0;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-7">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-in-up">
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {today}
          </p>
          <h1 className="text-[34px] md:text-[40px] font-semibold tracking-tight leading-tight">
            Welcome back
          </h1>
          <p className="text-[15px] text-muted-foreground max-w-xl">
            Your learning overview, revision queue, and quick actions — all in
            one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/entries/new" size="lg" variant="default">
            <Plus className="mr-1 h-4 w-4" />
            New entry
          </LinkButton>
          <LinkButton href="/revise" size="lg" variant="outline">
            <ArrowRight className="mr-1 h-4 w-4" />
            Start revision
          </LinkButton>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 animate-in-up stagger-1">
        <StatCard
          label="Day Streak"
          value={streak}
          icon={Flame}
          trend={streak > 0 ? "Keep the momentum" : "Start one today"}
          tone="amber"
        />
        <StatCard
          label="Due Today"
          value={cardsDueToday}
          icon={Target}
          trend={cardsDueToday > 0 ? "Cards waiting" : "All caught up"}
          tone="blue"
        />
        <StatCard
          label="Accuracy"
          value={`${accuracy}%`}
          icon={TrendingUp}
          trend="All-time"
          tone="emerald"
        />
        <StatCard
          label="Entries"
          value={totalEntries}
          icon={BookOpen}
          trend="Total captured"
          tone="violet"
        />
      </div>

      {/* This week in your notes (AI digest) */}
      <div className="animate-in-up stagger-2">
        <WeeklySummaryWidget />
      </div>

      {/* Interview Prep Plan */}
      <PrepPlan />

      {/* Knowledge Gap Analyzer teaser */}
      <GapTeaser />

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4 animate-in-up stagger-3">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-[18px] w-[18px] text-primary" />
              Today&apos;s Revision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-muted-foreground">
                  Weekly accuracy
                </span>
                <span className="text-2xl font-semibold tabular-nums">
                  {correctThisWeek}
                  <span className="text-muted-foreground/70">/{reviewedThisWeek}</span>
                </span>
              </div>
              <Progress
                value={
                  reviewedThisWeek > 0
                    ? (correctThisWeek / reviewedThisWeek) * 100
                    : 0
                }
                className="h-2"
              />
              <p className="text-[13px] text-muted-foreground">
                {reviewedThisWeek > 0
                  ? `${Math.round((correctThisWeek / reviewedThisWeek) * 100)}% correct this week`
                  : "Start reviewing to track weekly accuracy."}
              </p>
            </div>
            <LinkButton href="/revise" className="w-full" size="lg">
              Start Revision
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </LinkButton>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-chart-2/10 blur-3xl" />
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-[18px] w-[18px] text-chart-2" />
              Quick Add
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Learned something new? Capture it in seconds — title, notes,
              category. We&apos;ll handle revision scheduling.
            </p>
            <LinkButton
              href="/entries/new"
              variant="outline"
              className="w-full"
              size="lg"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Entry
            </LinkButton>
          </CardContent>
        </Card>
      </div>

      {/* Recent Entries */}
      <Card className="animate-in-up stagger-4">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div className="space-y-1">
            <CardTitle>Recent Entries</CardTitle>
            <p className="text-[13px] text-muted-foreground">
              Your latest captures across categories.
            </p>
          </div>
          <LinkButton href="/entries" variant="ghost" size="sm">
            View all
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </LinkButton>
        </CardHeader>
        <CardContent className="pt-2">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-4 text-[15px] font-medium">No entries yet</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Start by adding your first learning entry.
              </p>
              <LinkButton href="/entries/new" size="default" className="mt-4">
                <Plus className="mr-1.5 h-4 w-4" />
                Add entry
              </LinkButton>
            </div>
          ) : (
            <div className="-mx-1 divide-y divide-border/70">
              {entries.slice(0, 5).map((entry) => {
                const cat =
                  CATEGORY_CONFIG[
                    entry.category as keyof typeof CATEGORY_CONFIG
                  ];
                return (
                  <Link
                    key={entry.id}
                    href={`/entries/${entry.id}`}
                    className="group flex items-center justify-between gap-3 rounded-md px-3 py-3.5 -mx-2 transition-colors hover:bg-accent/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium truncate group-hover:text-foreground">
                        {entry.title}
                      </p>
                      <p className="text-[12.5px] text-muted-foreground mt-1">
                        {new Date(entry.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={cat?.color ?? ""}>
                        {cat?.label ?? entry.category}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
