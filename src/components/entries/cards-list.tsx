"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deleteCard } from "@/lib/actions/cards";
import type { Card } from "@/lib/types";

export function CardsList({ cards, entryId }: { cards: Card[]; entryId: string }) {
  const handleDelete = async (cardId: string) => {
    if (!confirm("Delete this revision card?")) return;
    await deleteCard(cardId, entryId);
  };

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No revision cards yet. Add some to start revising this topic.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <div
          key={card.id}
          className="p-3 rounded-lg border border-border group"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <Badge variant="secondary" className="text-xs mb-2">
                {card.question_type === "mcq"
                  ? "MCQ"
                  : card.question_type === "flashcard"
                  ? "Flashcard"
                  : "Short Answer"}
              </Badge>
              <p className="text-sm font-medium">{card.question}</p>
              {card.question_type === "mcq" && card.options && (
                <ul className="mt-2 space-y-1">
                  {(card.options as { text: string; isCorrect: boolean }[]).map(
                    (opt, i) => (
                      <li
                        key={i}
                        className={`text-xs px-2 py-1 rounded ${
                          opt.isCorrect
                            ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                            : "text-muted-foreground"
                        }`}
                      >
                        {opt.text}
                        {opt.isCorrect && " ✓"}
                      </li>
                    )
                  )}
                </ul>
              )}
              {card.question_type === "flashcard" && (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                  {card.answer}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
              onClick={() => handleDelete(card.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
