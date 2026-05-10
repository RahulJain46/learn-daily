import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, ArrowRight, AlertTriangle } from "lucide-react";
import { getLatestGapAnalysis } from "@/lib/actions/gap-analysis";
import type { GapSeverity } from "@/lib/types";

const SEVERITY_BADGE: Record<GapSeverity, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-100",
  low: "bg-muted text-muted-foreground",
};

/**
 * Compact summary of the latest gap analysis for the dashboard. If the user
 * has never run one, it nudges them to. Otherwise it shows the readiness
 * score + the single most critical gap so they have a one-glance "what
 * should I work on" answer without leaving the dashboard.
 */
export async function GapTeaser() {
  const latest = await getLatestGapAnalysis();

  if (!latest) {
    return (
      <Link href="/gaps" className="block">
        <Card className="hover:bg-accent transition-colors">
          <CardContent className="pt-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Run a knowledge gap analysis</p>
                <p className="text-xs text-muted-foreground">
                  Let AI synthesise your data into a personalised study plan.
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </CardContent>
        </Card>
      </Link>
    );
  }

  const readiness = latest.readout?.overall_readiness ?? 0;
  const topGap =
    [...(latest.gaps ?? [])].sort((a, b) => sevRank(b.severity) - sevRank(a.severity))[0] ??
    null;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Gap Analysis</p>
              <p className="text-xs text-muted-foreground">
                {latest.readout?.headline ?? "Latest readout"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{readiness}</div>
            <div className="text-[11px] text-muted-foreground -mt-1">readiness</div>
          </div>
        </div>
        <Progress value={readiness} />

        {topGap && (
          <div className="rounded-lg border border-border p-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Top priority
              </span>
              <Badge className={SEVERITY_BADGE[topGap.severity]}>
                {topGap.severity}
              </Badge>
            </div>
            <p className="text-sm font-medium">{topGap.topic}</p>
            {topGap.suggested_actions?.[0] && (
              <p className="text-sm text-muted-foreground">
                → {topGap.suggested_actions[0]}
              </p>
            )}
          </div>
        )}

        <Link
          href="/gaps"
          className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          View full analysis
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function sevRank(s: GapSeverity) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s] ?? 0;
}
