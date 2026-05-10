"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Read-only markdown renderer scoped to this app's design system. We DON'T
 * pull a heavyweight prose plugin — just hand-rolled Tailwind so we control
 * spacing in compact card contexts.
 *
 * remark-gfm enables GitHub-flavored markdown: tables, task lists, autolinks,
 * strikethrough — the bits a developer-leaning user actually expects.
 */
export function MarkdownView({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  if (!source.trim()) {
    return (
      <p className={cn("text-sm text-muted-foreground italic", className)}>
        Nothing here yet — switch to Edit to start writing.
      </p>
    );
  }
  return (
    <div
      className={cn(
        "text-sm leading-relaxed space-y-3",
        // Element-level styles
        "[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2",
        "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
        "[&_p]:leading-relaxed",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
        "[&_li]:leading-relaxed",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
        "[&_hr]:my-4 [&_hr]:border-border",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
        "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:bg-muted/40",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        // Code blocks
        "[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:leading-relaxed",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        // Inline code
        "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.85em] [&_code]:font-mono",
        // GFM task list checkboxes — render as styled (non-interactive) marks
        "[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:align-middle",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
