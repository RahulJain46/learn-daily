"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Plus,
  X,
  Check,
  Loader2,
  ArrowDownToLine,
  Eye,
  Pencil,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Note, NoteTodo } from "@/lib/types";
import { MarkdownView } from "@/components/notes/markdown-view";
import {
  updateNoteContent,
  addTodo,
  toggleTodo,
  deleteTodo,
  updateTodoLabel,
  carryOverTodos,
  getCarryoverCandidates,
  reorderTodos,
} from "@/lib/actions/notes";

interface Props {
  note: Note;
  initialTodos: NoteTodo[];
  /** Display label for the day, e.g. "Today" / "Wed, May 6". */
  dayLabel: string;
  /** Whether this is today's note — controls the carry-over CTA. */
  isToday: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DEBOUNCE_MS = 800;

export function DailyNotebook({ note, initialTodos, dayLabel, isToday }: Props) {
  const [content, setContent] = useState(note.content);
  const [todos, setTodos] = useState<NoteTodo[]>(initialTodos);
  const [newTodo, setNewTodo] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Edit/preview is local UI state — not persisted; users typically toggle
  // for a quick visual check then return to edit. Defaults to edit so the
  // primary action (writing) is always one keystroke away.
  const [notesView, setNotesView] = useState<"edit" | "preview">("edit");
  const [carryover, setCarryover] = useState<{
    sourceDay: string;
    todos: NoteTodo[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // ---- Autosave (debounced) -----------------------------------------------
  const lastSavedRef = useRef(note.content);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (content === lastSavedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = setTimeout(async () => {
      const res = await updateNoteContent(note.id, content);
      if (res.success) {
        lastSavedRef.current = content;
        setSaveState("saved");
        // Drop the "Saved" indicator after a moment.
        setTimeout(() => {
          setSaveState((s) => (s === "saved" ? "idle" : s));
        }, 1500);
      } else {
        setSaveState("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, note.id]);

  // Flush in-flight edit when tab is hidden / unmounted so we never lose data.
  useEffect(() => {
    function flush() {
      if (content !== lastSavedRef.current) {
        // Best-effort fire-and-forget; the page is going away.
        void updateNoteContent(note.id, content);
      }
    }
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    return () => {
      window.removeEventListener("beforeunload", flush);
    };
  }, [content, note.id]);

  // ---- Carry-over candidates ----------------------------------------------
  // Only check on today's view, and only when the day starts with no todos
  // — if the user has already added todos manually we don't nag.
  useEffect(() => {
    if (!isToday) return;
    if (todos.length > 0) return;
    let cancelled = false;
    (async () => {
      const res = await getCarryoverCandidates(note.day);
      if (cancelled) return;
      if (res.sourceDay && res.todos.length > 0) {
        setCarryover({ sourceDay: res.sourceDay, todos: res.todos });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isToday, note.day, todos.length]);

  // ---- Todo handlers ------------------------------------------------------
  function handleAddTodo() {
    const label = newTodo.trim();
    if (!label) return;

    // Optimistic prepend to a temporary id; reconcile when the server returns.
    const tempId = "tmp-" + Math.random().toString(36).slice(2);
    const optimistic: NoteTodo = {
      id: tempId,
      user_id: note.user_id,
      note_id: note.id,
      label,
      done: false,
      done_at: null,
      position: (todos.at(-1)?.position ?? 0) + 1,
      carried_from_note_id: null,
      created_at: new Date().toISOString(),
    };
    setTodos((prev) => [...prev, optimistic]);
    setNewTodo("");

    startTransition(async () => {
      const res = await addTodo(note.id, label);
      if (res.success && res.todo) {
        setTodos((prev) => prev.map((t) => (t.id === tempId ? res.todo! : t)));
      } else {
        // Roll back on failure.
        setTodos((prev) => prev.filter((t) => t.id !== tempId));
      }
    });
  }

  function handleToggle(todo: NoteTodo) {
    const nextDone = !todo.done;
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todo.id
          ? { ...t, done: nextDone, done_at: nextDone ? new Date().toISOString() : null }
          : t
      )
    );
    startTransition(async () => {
      const res = await toggleTodo(todo.id, nextDone);
      if (!res.success) {
        // Roll back.
        setTodos((prev) =>
          prev.map((t) =>
            t.id === todo.id
              ? { ...t, done: !nextDone, done_at: nextDone ? null : t.done_at }
              : t
          )
        );
      }
    });
  }

  function handleDelete(todoId: string) {
    const before = todos;
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
    startTransition(async () => {
      const res = await deleteTodo(todoId);
      if (!res.success) setTodos(before);
    });
  }

  // ---- Drag-to-reorder ---------------------------------------------------
  const sensors = useSensors(
    // Require a small drag distance before starting so click-to-edit and
    // tap-to-toggle still work without accidentally initiating a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = todos.findIndex((t) => t.id === active.id);
    const newIndex = todos.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    // Optimistic local reorder + best-effort server persist. If the server
    // call fails we leave the optimistic order in place; the user will
    // notice on their next refresh and can re-drag. Rolling back here would
    // be jarring.
    const next = arrayMove(todos, oldIndex, newIndex);
    setTodos(next);
    startTransition(async () => {
      await reorderTodos({
        noteId: note.id,
        orderedIds: next.map((t) => t.id),
      });
    });
  }

  async function handleCarryover() {
    if (!carryover) return;
    const ids = carryover.todos.map((t) => t.id);
    setCarryover(null);
    const res = await carryOverTodos({
      targetNoteId: note.id,
      sourceTodoIds: ids,
    });
    if (res.success && res.carried) {
      setTodos((prev) => [...prev, ...res.carried!]);
    }
  }

  const openCount = todos.filter((t) => !t.done).length;
  const doneCount = todos.length - openCount;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{dayLabel}</h1>
          <p className="text-xs text-muted-foreground">
            {todos.length === 0
              ? "No todos yet"
              : `${doneCount}/${todos.length} done · ${openCount} open`}
          </p>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          {saveState === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check className="h-3 w-3 text-green-600" />
              Saved
            </>
          )}
          {saveState === "error" && (
            <span className="text-red-600 dark:text-red-400">
              Save failed — keep typing to retry
            </span>
          )}
        </div>
      </div>

      {/* Carry-over banner */}
      {carryover && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-sm flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-primary shrink-0" />
            <span>
              {carryover.todos.length} unfinished todo
              {carryover.todos.length === 1 ? "" : "s"} from{" "}
              <span className="font-medium">
                {formatRelativeDay(carryover.sourceDay)}
              </span>
              .
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setCarryover(null)}
            >
              Dismiss
            </Button>
            <Button size="xs" onClick={handleCarryover}>
              Pull in
            </Button>
          </div>
        </div>
      )}

      {/* TODOs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Today&apos;s TODOs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add a TODO and press Enter…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTodo();
                }
              }}
              className="h-9"
            />
            <Button
              onClick={handleAddTodo}
              disabled={!newTodo.trim() || pending}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          {todos.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No todos yet. Capture what you want to learn or finish today.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={todos.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-1">
                  {todos.map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={() => handleToggle(todo)}
                      onDelete={() => handleDelete(todo.id)}
                      onLabelChange={(label) => {
                        setTodos((prev) =>
                          prev.map((t) =>
                            t.id === todo.id ? { ...t, label } : t
                          )
                        );
                        startTransition(async () => {
                          await updateTodoLabel(todo.id, label);
                        });
                      }}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Free-form notes (markdown-aware) */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">Notes</CardTitle>
          <div
            className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs"
            role="tablist"
            aria-label="Notes view mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={notesView === "edit"}
              onClick={() => setNotesView("edit")}
              className={cn(
                "px-2 py-1 rounded-sm flex items-center gap-1 transition-colors",
                notesView === "edit"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={notesView === "preview"}
              onClick={() => setNotesView("preview")}
              className={cn(
                "px-2 py-1 rounded-sm flex items-center gap-1 transition-colors",
                notesView === "preview"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Eye className="h-3 w-3" /> Preview
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {notesView === "edit" ? (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What did you learn today? Markdown supported (lists, code, tables, links)…"
              className="min-h-[280px] resize-y leading-relaxed font-mono text-[13px]"
            />
          ) : (
            <div className="min-h-[280px] rounded-md border border-input bg-background px-3 py-2.5">
              <MarkdownView source={content} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface TodoRowProps {
  todo: NoteTodo;
  onToggle: () => void;
  onDelete: () => void;
  onLabelChange: (label: string) => void;
}

function TodoRow({ todo, onToggle, onDelete, onLabelChange }: TodoRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.label);

  // dnd-kit: attach sortable behavior to the row. The drag handle (the grip
  // icon) gets `listeners` so dragging anywhere ELSE on the row (checkbox,
  // label, delete) keeps working as a normal click.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: todo.id });

  function commit() {
    setEditing(false);
    if (draft.trim() && draft !== todo.label) {
      onLabelChange(draft.trim());
    } else {
      setDraft(todo.label);
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40 transition-colors",
        isDragging && "opacity-60 bg-accent shadow-sm"
      )}
    >
      {/* Drag handle — only this listens for drag events. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          "touch-none cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground",
          "opacity-0 group-hover:opacity-100 transition-opacity"
        )}
        aria-label="Reorder todo"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {/*
        Native checkbox styled to match the design system. We avoid pulling
        in a Radix/Base UI checkbox primitive for one place — the component
        list intentionally stays small.
      */}
      <input
        type="checkbox"
        checked={todo.done}
        onChange={onToggle}
        className={cn(
          "h-4 w-4 rounded border-2 border-input bg-background text-primary",
          "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          "checked:bg-primary checked:border-primary cursor-pointer"
        )}
      />
      {editing ? (
        <Input
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(todo.label);
              setEditing(false);
            }
          }}
          className="h-7 flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "flex-1 text-left text-sm",
            todo.done && "line-through text-muted-foreground"
          )}
        >
          {todo.label}
        </button>
      )}
      {todo.carried_from_note_id && (
        <Badge variant="secondary" className="text-[10px]">
          carried
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete"
      >
        <X className="h-3 w-3" />
      </Button>
    </li>
  );
}

function formatRelativeDay(day: string): string {
  // "yesterday" / "Mon, May 5" — kept simple, no library.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(day + "T00:00:00");
  const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 1) return "yesterday";
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
