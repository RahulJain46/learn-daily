"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import type { WeeklySummary } from "@/lib/types";
import { getWeeklySummary } from "@/lib/actions/weekly-summary";

/**
 * Dashboard widget showing the AI-generated digest of the current week's
 * notes. Loads lazily on mount so it doesn't block the dashboard SSR. The
 * server caches by (user, week_start) keyed on an inputs hash, so most
 * loads hit the cache and don't burn Gemini quota.
 */
export function WeeklySummaryWidget() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await getWeeklySummary({ force });
      if (res.success && res.summary) {
        setSummary(res.summary);
        setFromCache(!!res.fromCache);
      } else {
        setError(res.error ?? "Failed to load summary");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  return (
    <Card className="bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            This week in your notes
          </CardTitle>
          <div className="flex items-center gap-2">
            {fromCache && summary && (
              <Badge variant="secondary" className="text-[10px]">
                cached
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => load(true)}
              disabled={loading || refreshing}
              title="Regenerate"
            >
              <RefreshCw
                className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !summary && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading this week&apos;s notes…
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {summary && !loading && (
          <>
            <p className="text-base font-medium leading-snug">{summary.headline}</p>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-background/60 px-2 py-1.5">
                <div className="text-lg font-bold">{summary.days_logged}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Days logged
                </div>
              </div>
              <div className="rounded-md bg-background/60 px-2 py-1.5">
                <div className="text-lg font-bold">{summary.todos_done}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  TODOs done
                </div>
              </div>
              <div className="rounded-md bg-background/60 px-2 py-1.5">
                <div className="text-lg font-bold">{summary.todos_carried}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Carried over
                </div>
              </div>
            </div>

            {summary.themes.length > 0 && (
              <div className="space-y-2">
                {summary.themes.map((theme, i) => (
                  <div key={i} className="rounded-md border border-border bg-background/40 p-2.5">
                    <div className="text-xs font-semibold mb-0.5">{theme.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {theme.detail}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {summary.suggestion && (
              <div className="text-sm rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
                <span className="font-medium">Try this next:</span> {summary.suggestion}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-muted-foreground">
                {summary.model_used ? `Generated by ${summary.model_used}` : ""}
              </p>
              <LinkButton href="/notes" size="xs" variant="ghost">
                Open notes
                <ArrowRight className="ml-1 h-3 w-3" />
              </LinkButton>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
