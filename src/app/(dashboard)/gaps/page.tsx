import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  Sparkles,
  Target,
  TrendingUp,
  CalendarDays,
  CheckCircle2,
  Gauge,
  BookOpen,
} from "lucide-react";
import {
  getLatestGapAnalysis,
  getGapAnalysisHistory,
} from "@/lib/actions/gap-analysis";
import { CATEGORY_CONFIG, type GapItem, type GapSeverity, type ReadinessLevel } from "@/lib/types";
import { AnalyzeButton } from "@/components/gaps/analyze-button";

export const dynamic = "force-dynamic";

const SEVERITY_STYLES: Record<
  GapSeverity,
  { label: string; badge: string; ring: string }
> = {
  critical: {
    label: "Critical",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    ring: "ring-red-200 dark:ring-red-900/40",
  },
  high: {
    label: "High",
    badge:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    ring: "ring-orange-200 dark:ring-orange-900/40",
  },
  medium: {
    label: "Medium",
    badge:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-100",
    ring: "ring-yellow-200 dark:ring-yellow-900/30",
  },
  low: {
    label: "Low",
    badge: "bg-muted text-muted-foreground",
    ring: "ring-border",
  },
};

const LEVEL_LABEL: Record<ReadinessLevel, string> = {
  foundational: "Foundational",
  developing: "Developing",
  proficient: "Proficient",
  advanced: "Advanced",
};

function formatRelative(iso: string) {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function readinessLevel(score: number): ReadinessLevel {
  if (score >= 80) return "advanced";
  if (score >= 60) return "proficient";
  if (score >= 40) return "developing";
  return "foundational";
}

export default async function GapsPage() {
  const [latest, history] = await Promise.all([
    getLatestGapAnalysis(),
    getGapAnalysisHistory(5),
  ]);

  const hasExisting = !!latest;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Knowledge Gap Analyzer
          </h1>
          <p className="text-muted-foreground">
            AI synthesis of your entries, reviews, evaluations, and mock interviews — turned into a prioritised study plan.
          </p>
        </div>
        <AnalyzeButton hasExisting={hasExisting} />
      </div>

      {!latest ? <EmptyState /> : <AnalysisView latest={latest} history={history} />}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <Sparkles className="h-10 w-10 mx-auto text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-lg font-medium">No analysis yet</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Once you have a few entries, card reviews, or answer evaluations,
            click <span className="font-medium">Analyse my gaps</span> to get an
            evidence-backed readout of where to focus next.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface LatestProps {
  latest: NonNullable<Awaited<ReturnType<typeof getLatestGapAnalysis>>>;
  history: Awaited<ReturnType<typeof getGapAnalysisHistory>>;
}

function AnalysisView({ latest, history }: LatestProps) {
  const readiness = latest.readout?.overall_readiness ?? 0;
  const level = (latest.readout?.level ?? readinessLevel(readiness)) as ReadinessLevel;
  const sortedGaps: GapItem[] = [...(latest.gaps ?? [])].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  );
  const summary = latest.signals_summary;

  // Trend: compare current readiness to the previous snapshot, if any.
  // Skip the current row (history[0] === latest).
  const previous = history[1];
  const trendDelta = previous?.readout?.overall_readiness != null
    ? readiness - previous.readout.overall_readiness
    : null;

  return (
    <>
      {/* Readout */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">
                  Readiness — {LEVEL_LABEL[level]}
                </span>
                {trendDelta !== null && (
                  <span
                    className={`text-xs font-medium ${
                      trendDelta > 0
                        ? "text-green-600 dark:text-green-400"
                        : trendDelta < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {trendDelta > 0 ? "+" : ""}
                    {trendDelta} vs previous
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold leading-tight">
                {latest.readout?.headline ?? "Your readout"}
              </p>
              {latest.readout?.one_liner && (
                <p className="text-sm text-muted-foreground max-w-2xl">
                  {latest.readout.one_liner}
                </p>
              )}
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1">
              <div className="text-4xl font-bold tabular-nums">{readiness}</div>
              <div className="text-xs text-muted-foreground">/ 100</div>
            </div>
          </div>
          <Progress value={readiness} />
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <CalendarDays className="h-3 w-3" />
            Updated {formatRelative(latest.created_at)}
            {latest.model_used ? ` · ${latest.model_used}` : ""}
          </p>
        </CardContent>
      </Card>

      {/* Signals summary — what the AI actually saw */}
      <SignalsCard summary={summary} />

      {/* Prioritised gaps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Prioritised gaps
          </CardTitle>
          <CardDescription>
            Ordered by severity. Each gap cites the data behind the call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedGaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The model didn&apos;t flag any concrete gaps in the latest snapshot.
            </p>
          ) : (
            sortedGaps.map((g, idx) => <GapCard key={`${g.topic}-${idx}`} gap={g} />)
          )}
        </CardContent>
      </Card>

      {/* Rubric weaknesses (cross-cutting answer-style patterns) */}
      {latest.rubric_weakness && latest.rubric_weakness.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-500" />
              Cross-cutting answer-style patterns
            </CardTitle>
            <CardDescription>
              From the staff-level rubric across all your evaluated answers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest.rubric_weakness.map((rw, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {rw.dimension.replace(/_/g, " ")}
                  </span>
                  <Badge variant="outline" className="tabular-nums">
                    {rw.avg_score.toFixed(1)} / 5
                    <span className="ml-1 text-muted-foreground">
                      · n={rw.sample_size}
                    </span>
                  </Badge>
                </div>
                <Progress value={(rw.avg_score / 5) * 100} />
                <p className="text-sm text-muted-foreground">{rw.insight}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 7-day study plan */}
      {latest.study_plan && latest.study_plan.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-500" />
              Your 7-day plan
            </CardTitle>
            <CardDescription>
              Concrete actions for the next week, derived from the gaps above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {latest.study_plan.map((item) => (
                <li
                  key={item.day}
                  className="flex gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex-shrink-0 size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                    {item.day}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium">{item.focus}</p>
                      <Badge variant="outline" className="text-xs">
                        ~{item.est_minutes} min
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.action}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Strengths — keep the page from reading purely negative */}
      {latest.strengths && latest.strengths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Strengths to lean on
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {latest.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tiny history strip — last few snapshots so the user can see progression. */}
      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Recent snapshots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="rounded-lg border border-border px-3 py-2 text-xs"
                >
                  <div className="font-semibold tabular-nums">
                    {h.readout?.overall_readiness ?? "?"}
                  </div>
                  <div className="text-muted-foreground">
                    {formatRelative(h.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function GapCard({ gap }: { gap: GapItem }) {
  const styles = SEVERITY_STYLES[gap.severity];
  const categoryLabel =
    CATEGORY_CONFIG[gap.category as keyof typeof CATEGORY_CONFIG]?.label ??
    gap.category;
  const confidencePct = Math.round((gap.confidence ?? 0) * 100);

  return (
    <div
      className={`rounded-lg ring-1 ${styles.ring} bg-card p-4 space-y-3`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={styles.badge}>{styles.label}</Badge>
            <Badge variant="outline" className="text-xs">
              {categoryLabel}
            </Badge>
            <span className="text-xs text-muted-foreground">
              confidence {confidencePct}%
            </span>
          </div>
          <p className="text-base font-semibold">{gap.topic}</p>
        </div>
      </div>

      {gap.evidence?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Evidence
          </p>
          <ul className="text-sm space-y-1">
            {gap.evidence.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">·</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gap.suggested_actions?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            What to do
          </p>
          <ul className="text-sm space-y-1">
            {gap.suggested_actions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary">→</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SignalsCard({
  summary,
}: {
  summary: LatestProps["latest"]["signals_summary"];
}) {
  if (!summary) return null;

  const categoryRows = Object.entries(summary.category_accuracy ?? {})
    .map(([cat, acc]) => ({
      cat,
      acc,
      n: summary.category_sample?.[cat] ?? 0,
    }))
    .sort((a, b) => a.acc - b.acc); // weakest first

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          What the AI saw
        </CardTitle>
        <CardDescription>
          Signals fed into the analysis — if a number looks off, it&apos;s probably because the model hasn&apos;t seen enough data yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Entries" value={summary.entries_total} />
          <Stat label="Cards" value={summary.cards_total} />
          <Stat label="Reviews" value={summary.reviews_total} />
          <Stat label="Evaluations" value={summary.evaluations_total} />
          <Stat
            label="Mock interviews"
            value={summary.mock_interviews_total}
            sub={
              summary.conversational_mocks_total
                ? `${summary.conversational_mocks_total} conversational`
                : undefined
            }
          />
          <Stat
            label="Uncovered"
            value={(summary.uncovered_categories ?? []).length}
            sub={(summary.uncovered_categories ?? []).join(", ") || "none"}
          />
        </div>

        {categoryRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Accuracy by category (weakest first)
            </p>
            {categoryRows.map(({ cat, acc, n }) => {
              const label =
                CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG]?.label ?? cat;
              const pct = Math.round(acc * 100);
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {pct}% · n={n}
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
              );
            })}
          </div>
        )}

        {summary.recurring_missed_keywords?.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Recurring missed concepts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {summary.recurring_missed_keywords.map((k) => (
                <Badge key={k} variant="outline" className="font-mono text-[11px]">
                  {k}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function severityRank(s: GapSeverity) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s] ?? 0;
}
