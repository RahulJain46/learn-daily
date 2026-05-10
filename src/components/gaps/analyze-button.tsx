"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { analyzeKnowledgeGaps } from "@/lib/actions/gap-analysis";

interface AnalyzeButtonProps {
  /** Distinguishes "first ever" copy from "regenerate" copy. */
  hasExisting: boolean;
}

/**
 * Triggers the AI synthesis. Uses both `useTransition` (so the route's RSCs
 * re-fetch with the new snapshot after persistence) and a local `loading`
 * flag (so the button stays disabled while the model is still generating
 * — `revalidatePath` resolves immediately on the server).
 */
export function AnalyzeButton({ hasExisting }: AnalyzeButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const busy = loading || isPending;

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeKnowledgeGaps();
      if (!res.success) {
        setError(res.error);
        return;
      }
      // Refresh the route so the freshly persisted snapshot renders.
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={onClick} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        {busy
          ? "Analysing your data…"
          : hasExisting
            ? "Re-run Analysis"
            : "Analyse my gaps"}
      </Button>
      {error && (
        <span className="text-xs flex items-center gap-1 text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </span>
      )}
    </div>
  );
}
