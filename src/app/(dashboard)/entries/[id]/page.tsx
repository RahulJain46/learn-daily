import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LinkButton } from "@/components/ui/link-button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getEntry } from "@/lib/actions/entries";
import { getCardsForEntry } from "@/lib/actions/cards";
import { EntryActions } from "@/components/entries/entry-actions";
import { CardsList } from "@/components/entries/cards-list";
import { AddCardForm } from "@/components/entries/add-card-form";
import { GenerateCardsButton } from "@/components/entries/generate-cards-button";
import { CATEGORY_CONFIG } from "@/lib/types";
import React from "react";

function RenderContent({ text }: { text: string }) {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
        >
          {match[1]}
          <ExternalLink className="h-3 w-3 inline" />
        </a>
      );
    } else if (match[3]) {
      parts.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1 break-all"
        >
          {match[3]}
          <ExternalLink className="h-3 w-3 inline" />
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [entry, cards] = await Promise.all([
    getEntry(id),
    getCardsForEntry(id),
  ]);

  if (!entry) {
    notFound();
  }

  const catConfig = CATEGORY_CONFIG[entry.category as keyof typeof CATEGORY_CONFIG] ?? {
    label: entry.category,
    color: "",
  };

  const difficultyColors: Record<string, string> = {
    easy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    hard: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <LinkButton href="/entries" variant="ghost" size="icon">
          <ArrowLeft className="h-5 w-5" />
        </LinkButton>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            {entry.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="secondary" className={catConfig.color}>
              {catConfig.label}
            </Badge>
            {entry.subcategory && (
              <Badge variant="secondary" className="text-xs">
                {entry.subcategory}
              </Badge>
            )}
            <Badge variant="secondary" className={difficultyColors[entry.difficulty]}>
              {entry.difficulty}
            </Badge>
            {entry.tags.map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <EntryActions entryId={entry.id} />
      </div>

      <Separator />

      {/* Content */}
      <Card>
        <CardContent className="pt-6">
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            <RenderContent text={entry.content} />
          </div>
        </CardContent>
      </Card>

      {/* Revision Cards */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">
            Revision Cards ({cards.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <GenerateCardsButton entryId={entry.id} />
            <AddCardForm entryId={entry.id} />
          </div>
        </CardHeader>
        <CardContent>
          <CardsList cards={cards} entryId={entry.id} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Created: {new Date(entry.created_at).toLocaleDateString()} &middot; Last
        updated: {new Date(entry.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
