"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { generateCardsFromEntry } from "@/lib/actions/ai-generate";

interface GenerateCardsButtonProps {
  entryId: string;
}

export function GenerateCardsButton({ entryId }: GenerateCardsButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await generateCardsFromEntry(entryId, 5);
      if (res.success) {
        setResult({
          type: "success",
          message: `Generated ${res.count} questions!`,
        });
      } else {
        setResult({
          type: "error",
          message: res.error || "Failed to generate",
        });
      }
    } catch {
      setResult({ type: "error", message: "Something went wrong" });
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 4000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        {loading ? "Generating..." : "AI Generate"}
      </Button>
      {result && (
        <span
          className={`text-xs flex items-center gap-1 ${
            result.type === "success"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {result.type === "success" ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          {result.message}
        </span>
      )}
    </div>
  );
}
