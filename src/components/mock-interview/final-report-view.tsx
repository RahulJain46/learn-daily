"use client";

import { Trophy, TrendingUp, AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/lib/utils";
import type { FinalReport, RubricDimension } from "@/lib/types";

const VERDICT_LABEL: Record<FinalReport["verdict"], { label: string; className: string }> = {
  strong_hire: {
    label: "Strong Hire",
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  hire: {
    label: "Hire",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  leaning_hire: {
    label: "Leaning Hire",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  no_hire: {
    label: "No Hire",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  },
  strong_no_hire: {
    label: "Strong No Hire",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
};

function RubricRow({ name, dim }: { name: string; dim: RubricDimension }) {
  const pct = (dim.score / 5) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium capitalize">{name.replace(/_/g, " ")}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {dim.score}/5
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="text-xs text-muted-foreground">{dim.feedback}</p>
    </div>
  );
}

interface Props {
  report: FinalReport;
  modeLabel: string;
}

export function FinalReportView({ report, modeLabel }: Props) {
  const verdict = VERDICT_LABEL[report.verdict];
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardContent className="pt-6 pb-6 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-accent flex items-center justify-center">
            <Trophy className="h-8 w-8 text-foreground" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {modeLabel} · Final report
            </p>
            <h2 className="text-3xl font-bold mt-1">{report.overall_score}/100</h2>
            <Badge className={cn("mt-2", verdict.className)}>{verdict.label}</Badge>
          </div>
          {report.model_used && (
            <p className="text-[11px] text-muted-foreground">
              Evaluated by {report.model_used}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff+ Rubric</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(report.staff_rubric).map(([k, v]) => (
              <RubricRow key={k} name={k} dim={v} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interview Dynamics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(report.interview_rubric).map(([k, v]) => (
              <RubricRow key={k} name={k} dim={v} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <CardTitle className="text-base">Highlight moments</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {report.highlight_moments.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {report.highlight_moments.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-green-600 mt-0.5">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <CardTitle className="text-base">Drop-off moments</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {report.drop_off_moments.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {report.drop_off_moments.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-orange-500 mt-0.5">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {report.improved_transcript && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <CardTitle className="text-base">What a strong answer would have sounded like</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {report.improved_transcript}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-3 pt-2">
        <LinkButton href="/mock-interview" variant="outline">
          Back to mock interview
        </LinkButton>
        <LinkButton href="/">Dashboard</LinkButton>
      </div>
    </div>
  );
}
