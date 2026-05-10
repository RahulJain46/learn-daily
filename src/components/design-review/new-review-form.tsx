"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SYSTEM_DESIGN_PROBLEMS } from "@/lib/types";
import { createReview } from "@/lib/actions/design-review";

type Mode = "template" | "custom";

export function NewReviewForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    SYSTEM_DESIGN_PROBLEMS[0].id
  );
  const [customTitle, setCustomTitle] = useState("");
  const [customBrief, setCustomBrief] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    setSubmitting(true);

    let title: string;
    let brief: string;
    let templateId: string | null;
    if (mode === "template") {
      const tpl = SYSTEM_DESIGN_PROBLEMS.find((p) => p.id === selectedTemplate);
      if (!tpl) {
        setError("Pick a problem first");
        setSubmitting(false);
        return;
      }
      title = tpl.title;
      brief = tpl.brief;
      templateId = tpl.id;
    } else {
      title = customTitle.trim();
      brief = customBrief.trim();
      templateId = null;
      if (!title || !brief) {
        setError("Title and brief are both required");
        setSubmitting(false);
        return;
      }
    }

    const res = await createReview({
      problemTitle: title,
      problemBrief: brief,
      problemTemplate: templateId,
    });
    setSubmitting(false);
    if (!res.success || !res.reviewId) {
      setError(res.error ?? "Failed to create review");
      return;
    }
    router.push(`/design-review/${res.reviewId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Start a new design review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={mode === "template" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("template")}
          >
            Pick a problem
          </Button>
          <Button
            variant={mode === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("custom")}
          >
            Custom prompt
          </Button>
        </div>

        {mode === "template" && (
          <div className="grid gap-2 md:grid-cols-2">
            {SYSTEM_DESIGN_PROBLEMS.map((problem) => {
              const active = selectedTemplate === problem.id;
              return (
                <button
                  key={problem.id}
                  type="button"
                  onClick={() => setSelectedTemplate(problem.id)}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{problem.title}</p>
                    {active && (
                      <Badge className="bg-primary text-primary-foreground text-[10px]">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                    {problem.brief}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {problem.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px] font-normal"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {mode === "custom" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Problem title
              </label>
              <Input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Design a distributed file system"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Brief — include scale targets, latency budget, key constraints
              </label>
              <Textarea
                value={customBrief}
                onChange={(e) => setCustomBrief(e.target.value)}
                placeholder="e.g. Targets: 100PB total storage, 10k concurrent uploads, multi-region durability, p99 read under 200ms..."
                className="min-h-[110px]"
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={handleStart} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…
              </>
            ) : (
              <>
                Start drawing <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
