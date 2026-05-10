"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DiagramCanvas } from "./diagram-canvas";
import { ReviewReport } from "./review-report";
import {
  saveDiagram,
  submitForReview,
} from "@/lib/actions/design-review";
import type {
  Diagram,
  DesignReviewReport,
  DesignQATurn,
  SystemDesignReview,
} from "@/lib/types";

interface ReviewEditorProps {
  review: SystemDesignReview;
}

export function ReviewEditor({ review }: ReviewEditorProps) {
  const router = useRouter();
  const [diagram, setDiagram] = useState<Diagram>(review.diagram);
  const [report, setReport] = useState<DesignReviewReport | null>(review.report);
  const [qaThread, setQaThread] = useState<DesignQATurn[]>(review.qa_thread);
  const [tab, setTab] = useState<"diagram" | "report">(
    review.report ? "report" : "diagram"
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Latest diagram in a ref so the autosave timer can read fresh state
  // without re-creating itself every keystroke. Updated inside an effect to
  // avoid mutating refs during render (React 19 rule).
  const diagramRef = useRef(diagram);
  useEffect(() => {
    diagramRef.current = diagram;
  }, [diagram]);

  const handleDiagramChange = useCallback((next: Diagram) => {
    setDiagram(next);
  }, []);

  // Debounced autosave — fires 1s after the user stops mutating. We don't
  // setState("saving") in the effect body itself to avoid a cascading render
  // on every keystroke; the indicator comes from the timer firing.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      setSaveState("saving");
      const res = await saveDiagram(review.id, diagramRef.current);
      if (cancelled) return;
      setSaveState(res.success ? "saved" : "idle");
      if (res.success) {
        setTimeout(() => {
          if (!cancelled) setSaveState("idle");
        }, 1500);
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [diagram, review.id]);

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    const res = await submitForReview(review.id, diagramRef.current);
    setSubmitting(false);
    if (!res.success || !res.report) {
      setSubmitError(res.error ?? "Submission failed");
      return;
    }
    setReport(res.report);
    setQaThread([]);
    setTab("report");
    router.refresh();
  }

  // Map referenced node ids -> annotation badges so the canvas can highlight
  // the components the AI flagged.
  const nodeAnnotations = useMemo(() => {
    if (!report) return undefined;
    const map: Record<string, { severity: string; tooltip: string }> = {};
    for (const issue of report.issues) {
      const id = issue.references_node_id;
      if (!id) continue;
      const existing = map[id];
      const ranking: Record<string, number> = {
        critical: 0,
        major: 1,
        minor: 2,
        nit: 3,
      };
      if (
        !existing ||
        ranking[issue.severity] < ranking[existing.severity as keyof typeof ranking]
      ) {
        map[id] = {
          severity: issue.severity,
          tooltip: `${issue.severity.toUpperCase()}: ${issue.observation}`,
        };
      }
    }
    return map;
  }, [report]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/design-review"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> All design reviews
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{review.problem_title}</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            {review.problem_brief}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator state={saveState} />
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Reviewing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" />
                {report ? "Re-run AI Review" : "Submit for AI Review"}
              </>
            )}
          </Button>
        </div>
      </div>

      {submitError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{submitError}</p>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "diagram" | "report")}>
        <TabsList>
          <TabsTrigger value="diagram">Diagram</TabsTrigger>
          <TabsTrigger value="report" disabled={!report}>
            Report{report ? ` · ${report.overall_score}/100` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diagram">
          <div className="h-[680px]">
            <DiagramCanvas
              initialDiagram={diagram}
              onChange={handleDiagramChange}
              nodeAnnotations={nodeAnnotations}
            />
          </div>
        </TabsContent>

        <TabsContent value="report">
          {report ? (
            <ReviewReport reviewId={review.id} report={report} qaThread={qaThread} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Submit your diagram to see the AI critique.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "idle") return null;
  return (
    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
      {state === "saving" ? (
        <>
          <Save className="h-3 w-3" /> saving…
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 text-green-600" /> saved
        </>
      )}
    </span>
  );
}
