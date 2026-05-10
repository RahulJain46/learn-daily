"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  DesignFollowUpQuestion,
  DesignIssue,
  DesignIssueSeverity,
  DesignQATurn,
  DesignReviewReport,
  DesignVerdict,
} from "@/lib/types";
import { answerFollowUp } from "@/lib/actions/design-review";

const RUBRIC_LABELS: Record<keyof DesignReviewReport["rubric"], string> = {
  scalability: "Scalability",
  availability: "Availability",
  consistency: "Consistency",
  data_model: "Data Model",
  bottlenecks: "Bottlenecks",
  distributed_tradeoffs: "Distributed Trade-offs",
  operational: "Operational",
};

const SEVERITY_STYLE: Record<DesignIssueSeverity, string> = {
  critical: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
  major: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
  minor: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  nit: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700",
};

const VERDICT_STYLE: Record<DesignVerdict, string> = {
  strong: "bg-emerald-500 text-white",
  solid: "bg-green-500 text-white",
  workable: "bg-amber-500 text-white",
  gaps: "bg-orange-500 text-white",
  weak: "bg-red-500 text-white",
};

interface ReviewReportProps {
  reviewId: string;
  report: DesignReviewReport;
  qaThread: DesignQATurn[];
}

export function ReviewReport({
  reviewId,
  report,
  qaThread: initialThread,
}: ReviewReportProps) {
  const [qaThread, setQaThread] = useState<DesignQATurn[]>(initialThread);

  const answeredByQuestionId = useMemo(() => {
    const m = new Map<string, DesignQATurn>();
    for (const t of qaThread) m.set(t.question_id, t);
    return m;
  }, [qaThread]);

  return (
    <div className="space-y-6">
      <ScoreHeader report={report} />
      <RubricGrid report={report} />
      <StrengthsAndIssues report={report} />
      <ImprovedHint report={report} />
      <FollowUpSection
        reviewId={reviewId}
        questions={report.follow_up_questions}
        answeredByQuestionId={answeredByQuestionId}
        onAnswered={(turn) =>
          setQaThread((prev) => [
            ...prev.filter((t) => t.question_id !== turn.question_id),
            turn,
          ])
        }
      />
    </div>
  );
}

function ScoreHeader({ report }: { report: DesignReviewReport }) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="text-5xl font-bold tabular-nums">
              {report.overall_score}
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
            <div className="space-y-1">
              <Badge className={cn("uppercase text-xs", VERDICT_STYLE[report.verdict])}>
                {report.verdict}
              </Badge>
              <p className="text-xs text-muted-foreground">
                {report.model_used ? `Judged by ${report.model_used}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            Staff+ rubric
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RubricGrid({ report }: { report: DesignReviewReport }) {
  const entries = Object.entries(report.rubric) as [
    keyof DesignReviewReport["rubric"],
    { score: number; feedback: string },
  ][];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rubric</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {entries.map(([key, dim]) => (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{RUBRIC_LABELS[key]}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {dim.score}/5
              </span>
            </div>
            <Progress value={(dim.score / 5) * 100} />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {dim.feedback}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StrengthsAndIssues({ report }: { report: DesignReviewReport }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Strengths
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.strengths.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clear strengths called out.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-green-600 shrink-0">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            Issues ({report.issues.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
          {report.issues.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No major issues — strong design.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IssueRow({ issue }: { issue: DesignIssue }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="secondary"
          className={cn("text-[10px] uppercase border", SEVERITY_STYLE[issue.severity])}
        >
          {issue.severity}
        </Badge>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
          {issue.area.replace("_", " ")}
        </span>
      </div>
      <p className="text-sm leading-snug">{issue.observation}</p>
      <p className="text-xs text-muted-foreground leading-snug">
        <span className="font-medium text-foreground/80">Suggestion: </span>
        {issue.suggestion}
      </p>
    </div>
  );
}

function ImprovedHint({ report }: { report: DesignReviewReport }) {
  return (
    <Card className="border-primary/30">
      <CardContent className="pt-6">
        <div className="flex gap-3">
          <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              What a 9/10 design would change
            </p>
            <p className="text-sm leading-relaxed">{report.improved_design_hint}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FollowUpSection({
  reviewId,
  questions,
  answeredByQuestionId,
  onAnswered,
}: {
  reviewId: string;
  questions: DesignFollowUpQuestion[];
  answeredByQuestionId: Map<string, DesignQATurn>;
  onAnswered: (turn: DesignQATurn) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Interviewer follow-up questions
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          A real interviewer would push you here. Answer each — the AI will
          score you 0–5 and tell you what was missing.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.map((q) => (
          <FollowUpItem
            key={q.id}
            reviewId={reviewId}
            question={q}
            existing={answeredByQuestionId.get(q.id) ?? null}
            onAnswered={onAnswered}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function FollowUpItem({
  reviewId,
  question,
  existing,
  onAnswered,
}: {
  reviewId: string;
  question: DesignFollowUpQuestion;
  existing: DesignQATurn | null;
  onAnswered: (turn: DesignQATurn) => void;
}) {
  const [open, setOpen] = useState(!existing);
  const [answer, setAnswer] = useState(existing?.user_answer ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluation = existing?.ai_evaluation ?? null;

  async function submit() {
    setError(null);
    if (!answer.trim()) {
      setError("Write an answer first");
      return;
    }
    setSubmitting(true);
    const res = await answerFollowUp({
      reviewId,
      questionId: question.id,
      answer: answer.trim(),
    });
    setSubmitting(false);
    if (!res.success || !res.turn) {
      setError(res.error ?? "Failed to submit");
      return;
    }
    onAnswered(res.turn);
    setOpen(false);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        <Badge variant="secondary" className="text-[10px] uppercase shrink-0">
          {question.focus_area.replace("_", " ")}
        </Badge>
        <span className="flex-1 text-sm font-medium leading-snug">{question.question}</span>
        {evaluation && (
          <Badge
            className={cn(
              "shrink-0 tabular-nums",
              evaluation.score >= 4
                ? "bg-green-500 text-white"
                : evaluation.score >= 3
                  ? "bg-amber-500 text-white"
                  : "bg-red-500 text-white"
            )}
          >
            {evaluation.score}/5
          </Badge>
        )}
      </button>

      {open && (
        <div className="border-t border-border p-3 space-y-3">
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Reason out loud — touch on scale numbers, failure modes, trade-offs..."
            className="min-h-[120px]"
            disabled={submitting}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {existing
                ? "Re-submitting will replace your previous answer."
                : "Tip: pretend you're at the whiteboard."}
            </p>
            <Button onClick={submit} disabled={submitting} size="sm">
              {submitting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Grading…
                </>
              ) : existing ? (
                "Re-submit"
              ) : (
                "Submit answer"
              )}
            </Button>
          </div>

          {evaluation && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                AI feedback
              </p>
              <p className="text-sm leading-relaxed">{evaluation.feedback}</p>
              {evaluation.follow_up && (
                <div className="text-xs italic text-muted-foreground border-l-2 border-primary pl-2">
                  Follow-up: {evaluation.follow_up}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
