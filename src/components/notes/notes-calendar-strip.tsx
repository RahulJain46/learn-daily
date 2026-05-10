"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CalendarDay } from "@/lib/actions/notes";

interface Props {
  days: CalendarDay[];
  /** ISO YYYY-MM-DD of the currently displayed day. */
  activeDay: string;
}

/**
 * Compact horizontal strip of the last N calendar days. Each cell shows the
 * day number and small dots:
 *   filled circle = has note content
 *   small badge   = number of open todos on that day
 */
export function NotesCalendarStrip({ days, activeDay }: Props) {
  return (
    <div className="overflow-x-auto -mx-1 pb-1">
      <div className="flex items-stretch gap-1 px-1">
        {days.map((d) => {
          const isActive = d.day === activeDay;
          const date = new Date(d.day + "T00:00:00");
          const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
          const dayNum = date.getDate();
          return (
            <Link
              key={d.day}
              href={`/notes/${d.day}`}
              className={cn(
                "min-w-[52px] flex-1 max-w-[80px] text-center rounded-md border px-1.5 py-2 transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent/50"
              )}
            >
              <div
                className={cn(
                  "text-[10px] uppercase tracking-wide",
                  isActive ? "opacity-90" : "text-muted-foreground"
                )}
              >
                {weekday}
              </div>
              <div className="text-base font-semibold leading-tight">{dayNum}</div>
              <div className="mt-1 flex items-center justify-center gap-1 h-2">
                {d.hasContent && (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isActive ? "bg-primary-foreground" : "bg-primary"
                    )}
                  />
                )}
                {d.openTodos > 0 && (
                  <span
                    className={cn(
                      "text-[9px] font-mono px-1 rounded",
                      isActive
                        ? "bg-primary-foreground/20"
                        : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                    )}
                  >
                    {d.openTodos}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
