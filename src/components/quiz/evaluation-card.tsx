"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Lightbulb,
  MessageCircleQuestion,
  Loader2,
  Tag,
} from "lucide-react";
import type { AnswerEvaluation } from "@/lib/actions/evaluate-answer";

const RUBRIC_LABELS: Record<keyof AnswerEvaluation["rubric"], string> = {
  technical_accuracy: "Technical Accuracy",
  depth: "Depth",
  communication_clarity: "Communication",
  tradeoff_awareness: "Trade-off Awareness",
  staff_level_signal: "Staff-Level Signal",
  operational_excellence: "Operational Excellence",
  influence_communication: "Influence & Stakeholder Comms",
};

/**
 * Short hint shown under the dimension name to teach the user what each
 * staff-level dimension is actually measuring. Helps them self-correct
 * on future answers without needing to re-read the rubric prompt.
 */
const RUBRIC_HINTS: Record<keyof AnswerEvaluation["rubric"], string> = {
  technical_accuracy: "Is it factually correct?",
  depth: "First-principles, not just recall.",
  communication_clarity: "Structured & easy to follow.",
  tradeoff_awareness: "Did you name the alternatives & where this breaks?",
  staff_level_signal: "System thinking, ambiguity handling, judgment.",
  operational_excellence: "Monitoring, deploy, on-call, failure modes.",
  influence_communication: "Could you sell this to a skeptical PM/exec?",
};

const VERDICT_STYLES: Record<AnswerEvaluation["verdict"], string> = {
  excellent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800",
  strong: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 border-green-300 dark:border-green-800",
  adequate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-800",
  weak: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 border-orange-300 dark:border-orange-800",
  incorrect: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 border-red-300 dark:border-red-800",
};

/** Visually flag the staff-specific dimensions so users see them as a separate group. */
const STAFF_TIER_KEYS: ReadonlySet<keyof AnswerEvaluation["rubric"]> = new Set([
  "operational_excellence",
  "influence_communication",
]);

interface EvaluationCardProps {
  evaluation: AnswerEvaluation | null;
  loading: boolean;
  error?: string | null;
}

export function EvaluationCard({ evaluation, loading, error }: EvaluationCardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <div>
          <p className="text-sm font-medium">Evaluating with Staff+ rubric…</p>
          <p className="text-xs text-muted-foreground">
            Scoring 7 dimensions: accuracy, depth, clarity, trade-offs, staff signal, operational excellence, influence.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Evaluation failed</p>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  if (!evaluation) return null;

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-4">
      {/* Header: score + verdict */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Staff+ Competency Evaluation</p>
            <p className="text-xs text-muted-foreground">
              AI-graded against an L6+ rubric
              {evaluation.model_used && (
                <span className="ml-1 opacity-70">· {evaluation.model_used}</span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold leading-none">{evaluation.overall_score}</div>
          <Badge
            variant="outline"
            className={cn("mt-1 text-[10px] capitalize", VERDICT_STYLES[evaluation.verdict])}
          >
            {evaluation.verdict}
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Rubric breakdown — 7 dimensions, staff-tier ones visually grouped */}
      <div className="space-y-2.5">
        {(Object.keys(RUBRIC_LABELS) as Array<keyof AnswerEvaluation["rubric"]>).map((key) => {
          const item = evaluation.rubric[key];
          const pct = (item.score / 5) * 100;
          const isStaffTier = STAFF_TIER_KEYS.has(key);
          return (
            <div
              key={key}
              className={cn(
                "space-y-1",
                isStaffTier && "rounded-md border border-purple-200/60 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 p-2"
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{RUBRIC_LABELS[key]}</span>
                  {isStaffTier && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-purple-300 text-purple-700 dark:text-purple-300">
                      Staff+
                    </Badge>
                  )}
                </div>
                <span className="tabular-nums text-muted-foreground">{item.score} / 5</span>
              </div>
              <Progress value={pct} className="h-1.5" />
              <p className="text-[11px] text-muted-foreground/80 italic">{RUBRIC_HINTS[key]}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.feedback}</p>
            </div>
          );
        })}
      </div>

      {/* Missed keywords — surfaces the vocab gap directly */}
      {evaluation.missed_keywords && evaluation.missed_keywords.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300">
              <Tag className="h-3.5 w-3.5" />
              Concepts you should have mentioned
            </div>
            <div className="flex flex-wrap gap-1.5">
              {evaluation.missed_keywords.map((kw, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] border-rose-300 text-rose-700 dark:text-rose-300 dark:border-rose-900/60"
                >
                  {kw}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Strengths & gaps */}
      {(evaluation.strengths.length > 0 || evaluation.gaps.length > 0) && (
        <>
          <Separator />
          <div className="grid sm:grid-cols-2 gap-3">
            {evaluation.strengths.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Strengths
                </div>
                <ul className="space-y-1">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-4 -indent-2">
                      • {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {evaluation.gaps.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-300">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Gaps
                </div>
                <ul className="space-y-1">
                  {evaluation.gaps.map((g, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-4 -indent-2">
                      • {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {/* Improved answer */}
      {evaluation.improved_answer && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
              Staff-Level Reference Answer
            </div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap rounded-md bg-accent p-3">
              {evaluation.improved_answer}
            </p>
          </div>
        </>
      )}

      {/* Follow-ups */}
      {evaluation.follow_up_questions.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <MessageCircleQuestion className="h-3.5 w-3.5 text-purple-600" />
              An Interviewer Would Ask Next
            </div>
            <ul className="space-y-1">
              {evaluation.follow_up_questions.map((q, i) => (
                <li
                  key={i}
                  className="text-xs leading-relaxed pl-4 -indent-2 text-muted-foreground"
                >
                  <TrendingUp className="inline h-3 w-3 mr-1 text-purple-500" />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
