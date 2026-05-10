"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LinkButton } from "@/components/ui/link-button";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Trophy,
  Shuffle,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface FlashcardData {
  id: string;
  question: string;
  answer: string;
  entry_id: string;
  entries?: { category: string; tags: string[] } | { category: string; tags: string[] }[] | null;
}

export default function FlashcardsPage() {
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    loadFlashcards();
  }, []);

  const loadFlashcards = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("cards")
      .select("id, question, answer, entry_id, entries(category, tags)")
      .eq("question_type", "flashcard")
      .limit(20);

    if (data && data.length > 0) {
      setCards(data.sort(() => Math.random() - 0.5));
    } else {
      // Fallback: use all cards as flashcards
      const { data: allCards } = await supabase
        .from("cards")
        .select("id, question, answer, entry_id, entries(category, tags)")
        .limit(20);
      if (allCards) setCards(allCards.sort(() => Math.random() - 0.5));
    }
    setLoading(false);
  };

  const categoryColors: Record<string, string> = {
    dsa: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    system_design: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    concept: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };

  const categoryLabels: Record<string, string> = {
    dsa: "DSA",
    system_design: "System Design",
    concept: "Concept",
  };

  const progress = cards.length > 0 ? (reviewed.size / cards.length) * 100 : 0;

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    if (!isFlipped) {
      setReviewed((prev) => new Set([...prev, currentIndex]));
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 >= cards.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
    }
  };

  const handleShuffle = () => {
    const randomIndex = Math.floor(Math.random() * cards.length);
    setCurrentIndex(randomIndex);
    setIsFlipped(false);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setReviewed(new Set());
    setIsComplete(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <h2 className="text-xl font-bold">No Flashcards Yet</h2>
            <p className="text-sm text-muted-foreground">
              Add flashcard-type revision cards to your entries to use this mode.
            </p>
            <LinkButton href="/entries">Go to Entries</LinkButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Trophy className="h-8 w-8 text-green-600 dark:text-green-300" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">All Cards Reviewed!</h2>
              <p className="text-muted-foreground mt-1">
                You&apos;ve gone through all {cards.length} flashcards.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={handleRestart}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Go Again
              </Button>
              <LinkButton href="/revise">Back to Modes</LinkButton>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const entryData = Array.isArray(currentCard.entries) ? currentCard.entries[0] : currentCard.entries;
  const cardCategory = entryData?.category || "concept";
  const cardTags = entryData?.tags || [];

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <LinkButton href="/revise" variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Exit
        </LinkButton>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {currentIndex + 1} of {cards.length}
          </span>
          <Button variant="ghost" size="sm" onClick={handleShuffle}>
            <Shuffle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      {/* Flashcard */}
      <div className="perspective-1000">
        <div
          onClick={handleFlip}
          className={cn(
            "relative w-full min-h-[350px] md:min-h-[400px] cursor-pointer transition-transform duration-500 transform-style-3d",
            isFlipped && "rotate-y-180"
          )}
        >
          {/* Front */}
          <Card
            className={cn(
              "absolute inset-0 backface-hidden flex flex-col",
              isFlipped && "invisible"
            )}
          >
            <CardContent className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Badge
                variant="secondary"
                className={cn("mb-4", categoryColors[cardCategory])}
              >
                {categoryLabels[cardCategory] || "Concept"}
              </Badge>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                {currentCard.question}
              </h2>
              <div className="flex flex-wrap gap-2 mb-6">
                {cardTags.slice(0, 3).map((tag: string) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-auto">
                Tap to reveal
              </p>
            </CardContent>
          </Card>

          {/* Back */}
          <Card
            className={cn(
              "absolute inset-0 backface-hidden rotate-y-180 flex flex-col",
              !isFlipped && "invisible"
            )}
          >
            <CardContent className="flex-1 flex flex-col p-6 md:p-8">
              <Badge
                variant="secondary"
                className={cn("mb-4 self-start", categoryColors[cardCategory])}
              >
                {categoryLabels[cardCategory] || "Concept"}
              </Badge>
              <div className="flex-1 flex items-center">
                <pre className="text-sm md:text-base whitespace-pre-wrap font-sans leading-relaxed">
                  {currentCard.answer}
                </pre>
              </div>
              <p className="text-sm text-muted-foreground text-center mt-4">
                Tap to flip back
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>
        <div className="flex gap-1">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentIndex(i);
                setIsFlipped(false);
              }}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                i === currentIndex
                  ? "bg-primary"
                  : reviewed.has(i)
                  ? "bg-primary/40"
                  : "bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
        <Button variant="outline" onClick={handleNext}>
          {currentIndex + 1 >= cards.length ? "Finish" : "Next"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
