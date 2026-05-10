import Link from "next/link";
import { ArrowRight, Network, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listReviews } from "@/lib/actions/design-review";
import { NewReviewForm } from "@/components/design-review/new-review-form";

const VERDICT_BADGE_CLASS: Record<string, string> = {
  strong: "bg-emerald-500 text-white",
  solid: "bg-green-500 text-white",
  workable: "bg-amber-500 text-white",
  gaps: "bg-orange-500 text-white",
  weak: "bg-red-500 text-white",
};

export default async function DesignReviewListPage() {
  const reviews = await listReviews();
  const reviewedCount = reviews.filter((r) => r.status === "reviewed").length;
  const drafts = reviews.filter((r) => r.status === "draft");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Design Review</h1>
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" /> AI Critique
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Draw a system design on the canvas. The AI grades you on a Staff+
            rubric and pushes follow-up questions until your reasoning holds up.
          </p>
        </div>
      </div>

      <NewReviewForm />

      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Drafts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {drafts.map((r) => (
                <Link
                  key={r.id}
                  href={`/design-review/${r.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.problem_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.diagram.nodes.length} components ·{" "}
                      {r.diagram.edges.length} connections · last edited{" "}
                      {new Date(r.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Past reviews{reviewedCount > 0 ? ` (${reviewedCount})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.filter((r) => r.status === "reviewed").length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No reviews yet. Pick a problem above and start drawing — your
              first AI critique is just a few minutes away.
            </p>
          ) : (
            <div className="space-y-2">
              {reviews
                .filter((r) => r.status === "reviewed")
                .map((r) => (
                  <Link
                    key={r.id}
                    href={`/design-review/${r.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {r.problem_title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.diagram.nodes.length} components ·{" "}
                        {r.diagram.edges.length} connections ·{" "}
                        {r.qa_thread.length} follow-ups answered ·{" "}
                        {new Date(r.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.report && (
                        <>
                          <span className="text-sm font-bold tabular-nums">
                            {r.report.overall_score}
                          </span>
                          <Badge
                            className={
                              VERDICT_BADGE_CLASS[r.report.verdict] ??
                              "bg-muted text-foreground"
                            }
                          >
                            {r.report.verdict}
                          </Badge>
                        </>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
