"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  FileText,
  ListTodo,
  BookOpen,
  Tag,
  FolderTree,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { searchEntries } from "@/lib/actions/entries";
import { searchNotes } from "@/lib/actions/notes";
import {
  CATEGORY_CONFIG,
  type EntrySearchHit,
  type NotesSearchHit,
} from "@/lib/types";

const DEBOUNCE_MS = 200;

/**
 * Global search popup launched from the top bar (or ⌘K / Ctrl+K).
 * Searches the user's entries (title, content, tags, category, subcategory)
 * and daily notes (content + todo labels) in parallel and groups results.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entryHits, setEntryHits] = useState<EntrySearchHit[]>([]);
  const [noteHits, setNoteHits] = useState<NotesSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K toggles, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input shortly after opening so the slide-in doesn't fight focus.
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setQuery("");
    setEntryHits([]);
    setNoteHits([]);
  }, [open]);

  // Debounced parallel search across entries + notes.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setEntryHits([]);
      setNoteHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [entries, notes] = await Promise.all([
          searchEntries(trimmed, 10),
          searchNotes(trimmed, 10),
        ]);
        setEntryHits(entries);
        setNoteHits(notes);
        setActiveIdx(0);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Flat list of nav targets for keyboard ↑/↓ + Enter.
  const targets: { href: string }[] = [
    ...entryHits.map((h) => ({ href: `/entries/${h.id}` })),
    ...noteHits.map((h) => ({ href: `/notes/${h.day}` })),
  ];

  function handleNavKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(targets.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const t = targets[activeIdx];
      if (t) {
        setOpen(false);
        router.push(t.href);
      }
    }
  }

  const showEmpty =
    !loading && query.trim().length > 0 && targets.length === 0;

  return (
    <>
      {/* Top-bar trigger pill */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 hover:bg-muted hover:border-border transition-colors px-3.5 h-10 w-[320px] text-muted-foreground group"
      >
        <Search className="h-[16px] w-[16px] group-hover:text-foreground transition-colors" />
        <span className="text-[14px] flex-1 text-left">
          Search entries, notes…
        </span>
        <kbd className="ml-auto text-[11px] font-mono rounded border border-border bg-background px-1.5 py-0.5">
          ⌘K
        </kbd>
      </button>

      {/* Mobile trigger — just an icon button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="md:hidden flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10">
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleNavKey}
                placeholder="Search entries, content, tags, categories, notes…"
                className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              />
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <kbd className="text-[11px] font-mono rounded border border-border bg-background px-1.5 py-0.5 text-muted-foreground">
                Esc
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {!query.trim() && (
                <EmptyHint />
              )}

              {showEmpty && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No matches for{" "}
                  <span className="font-medium text-foreground">
                    “{query.trim()}”
                  </span>
                  .
                </div>
              )}

              {entryHits.length > 0 && (
                <ResultGroup label="Entries">
                  {entryHits.map((hit, i) => {
                    const idx = i;
                    return (
                      <EntryRow
                        key={hit.id}
                        hit={hit}
                        active={idx === activeIdx}
                        onHover={() => setActiveIdx(idx)}
                        onClick={() => {
                          setOpen(false);
                          router.push(`/entries/${hit.id}`);
                        }}
                      />
                    );
                  })}
                </ResultGroup>
              )}

              {noteHits.length > 0 && (
                <ResultGroup label="Notes & Todos">
                  {noteHits.map((hit, i) => {
                    const idx = entryHits.length + i;
                    return (
                      <NoteRow
                        key={`${hit.noteId}-${hit.matchedIn}-${i}`}
                        hit={hit}
                        active={idx === activeIdx}
                        onHover={() => setActiveIdx(idx)}
                        onClick={() => {
                          setOpen(false);
                          router.push(`/notes/${hit.day}`);
                        }}
                      />
                    );
                  })}
                </ResultGroup>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3.5 py-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <KbdHint k="↑↓" label="navigate" />
                <KbdHint k="↵" label="open" />
                <KbdHint k="Esc" label="close" />
              </div>
              <span>{targets.length} result{targets.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function ResultGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1.5">
      <div className="px-3.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function EntryRow({
  hit,
  active,
  onHover,
  onClick,
}: {
  hit: EntrySearchHit;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const cat = CATEGORY_CONFIG[hit.category];
  const Icon = matchIcon(hit.matchedIn);
  return (
    <li>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors",
          active ? "bg-accent" : "hover:bg-accent/60"
        )}
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium text-foreground">
              {hit.title}
            </span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                cat?.color ?? "bg-muted text-foreground"
              )}
            >
              {cat?.label ?? hit.category}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Icon className="h-3 w-3" />
            <span className="truncate">{hit.snippet}</span>
          </div>
        </div>
        <span className="shrink-0 self-center text-[10px] uppercase tracking-wider text-muted-foreground/80">
          {hit.matchedIn}
        </span>
      </button>
    </li>
  );
}

function NoteRow({
  hit,
  active,
  onHover,
  onClick,
}: {
  hit: NotesSearchHit;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const Icon = hit.matchedIn === "content" ? FileText : ListTodo;
  return (
    <li>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors",
          active ? "bg-accent" : "hover:bg-accent/60"
        )}
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {formatDay(hit.day)} · {hit.matchedIn === "content" ? "note" : "todo"}
          </div>
          <div className="truncate text-[14px] text-foreground">
            {hit.snippet}
          </div>
        </div>
      </button>
    </li>
  );
}

function EmptyHint() {
  return (
    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Search className="h-4 w-4" />
      </div>
      <p>Type to search across your entries and daily notes.</p>
      <p className="mt-1 text-[12px]">
        Title · content · tags · category · todos
      </p>
    </div>
  );
}

function KbdHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="font-mono rounded border border-border bg-background px-1 py-0.5 text-[10px]">
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  );
}

function matchIcon(kind: EntrySearchHit["matchedIn"]) {
  switch (kind) {
    case "tag":
      return Tag;
    case "category":
      return Layers;
    case "subcategory":
      return FolderTree;
    case "content":
      return FileText;
    case "title":
    default:
      return BookOpen;
  }
}

function formatDay(day: string): string {
  return new Date(day + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
