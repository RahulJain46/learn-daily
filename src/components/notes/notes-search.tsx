"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Loader2, FileText, ListTodo, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchNotes } from "@/lib/actions/notes";
import type { NotesSearchHit } from "@/lib/types";

const DEBOUNCE_MS = 250;

/**
 * Debounced free-text search across notes content + todo labels.
 * Sits at the top of /notes; when there's a query, the results panel
 * floats over the calendar strip.
 */
export function NotesSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NotesSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await searchNotes(trimmed, 20);
        setResults(hits);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search your notes and todos…"
          className="h-9 pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {loading && (
            <div className="px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No matches.
            </div>
          )}
          {!loading && results.length > 0 && (
            <ul className="divide-y divide-border">
              {results.map((hit, i) => (
                <li key={`${hit.noteId}-${hit.matchedIn}-${i}`}>
                  <Link
                    href={`/notes/${hit.day}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-accent/60 transition-colors"
                  >
                    <span className="mt-0.5 text-muted-foreground">
                      {hit.matchedIn === "content" ? (
                        <FileText className="h-3.5 w-3.5" />
                      ) : (
                        <ListTodo className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {formatDay(hit.day)} ·{" "}
                        {hit.matchedIn === "content" ? "note" : "todo"}
                      </div>
                      <div
                        className={cn(
                          "text-sm truncate",
                          hit.matchedIn === "todo" && "text-foreground"
                        )}
                      >
                        {hit.snippet}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatDay(day: string): string {
  return new Date(day + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
