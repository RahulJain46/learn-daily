"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { X, Zap, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface QuizCard {
  id: string;
  question_type: string;
  question: string;
  options: { text: string; isCorrect: boolean }[] | null;
  answer: string;
}

const STORAGE_KEY = "popup-quiz-last-shown";
const FREQUENCY_KEY = "popup-quiz-frequency";

function getFrequencyMs(): number {
  if (typeof window === "undefined") return 30 * 60 * 1000;
  const stored = localStorage.getItem(FREQUENCY_KEY);
  if (!stored) return 30 * 60 * 1000;
  return parseInt(stored, 10);
}

export function PopupQuiz() {
  const [card, setCard] = useState<QuizCard | null>(null);
  const [visible, setVisible] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchRandomCard = useCallback(async () => {
    try {
      const res = await fetch("/api/quiz/random");
      const data = await res.json();
      if (data.card) {
        setCard(data.card);
        setVisible(true);
        setSelectedOption(null);
        setAnswered(false);
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
      }
    } catch {
      // Silently fail - popup is non-critical
    }
  }, []);

  useEffect(() => {
    const frequencyMs = getFrequencyMs();
    const lastShown = localStorage.getItem(STORAGE_KEY);
    const elapsed = lastShown ? Date.now() - parseInt(lastShown, 10) : Infinity;

    // Show first popup after remaining time or immediately if enough time has passed
    const initialDelay = elapsed >= frequencyMs ? 60000 : frequencyMs - elapsed;

    const timeout = setTimeout(() => {
      fetchRandomCard();
    }, initialDelay);

    const interval = setInterval(() => {
      fetchRandomCard();
    }, frequencyMs);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchRandomCard]);

  const handleDismiss = () => {
    setVisible(false);
    setCard(null);
  };

  const handleSubmitMCQ = async () => {
    if (selectedOption === null || !card?.options) return;
    setAnswered(true);
    const isCorrect = card.options[selectedOption].isCorrect;
    const rating = isCorrect ? 3 : 1;
    await submitAnswer(rating);
  };

  const handleRevealFlashcard = () => {
    setAnswered(true);
  };

  const handleRating = async (rating: 1 | 2 | 3 | 4) => {
    await submitAnswer(rating);
    setTimeout(handleDismiss, 1500);
  };

  const submitAnswer = async (rating: 1 | 2 | 3 | 4) => {
    if (!card) return;
    setLoading(true);
    try {
      await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: card.id,
          user_answer:
            selectedOption !== null && card.options
              ? card.options[selectedOption].text
              : undefined,
          rating,
        }),
      });
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !card) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-5 fade-in duration-300">
      <Card className="shadow-xl border-2 border-primary/20">
        <CardContent className="pt-4 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold">Pop Quiz!</span>
              <Badge variant="secondary" className="text-xs">
                {card.question_type === "mcq"
                  ? "MCQ"
                  : card.question_type === "flashcard"
                  ? "Flashcard"
                  : "Short Answer"}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Question */}
          <p className="text-sm font-medium mb-3 leading-relaxed">
            {card.question}
          </p>

          {/* MCQ Options */}
          {card.question_type === "mcq" && card.options && !answered && (
            <div className="space-y-2">
              {card.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedOption(idx)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md border text-xs transition-colors",
                    selectedOption === idx
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {option.text}
                </button>
              ))}
              <Button
                size="sm"
                className="w-full mt-2"
                disabled={selectedOption === null || loading}
                onClick={handleSubmitMCQ}
              >
                {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Submit
              </Button>
            </div>
          )}

          {/* MCQ Feedback */}
          {card.question_type === "mcq" && card.options && answered && (
            <div className="space-y-2">
              {card.options.map((option, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "px-3 py-2 rounded-md border text-xs flex items-center gap-2",
                    option.isCorrect
                      ? "border-green-500 bg-green-50 dark:bg-green-950"
                      : selectedOption === idx
                      ? "border-red-500 bg-red-50 dark:bg-red-950"
                      : "border-border opacity-50"
                  )}
                >
                  {option.isCorrect && (
                    <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                  )}
                  {!option.isCorrect && selectedOption === idx && (
                    <XCircle className="h-3 w-3 text-red-600 shrink-0" />
                  )}
                  {option.text}
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Auto-closing...
              </p>
            </div>
          )}

          {/* Flashcard / Short Answer - Show "Reveal" button */}
          {(card.question_type === "flashcard" ||
            card.question_type === "short_answer") &&
            !answered && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleRevealFlashcard}
              >
                Reveal Answer
              </Button>
            )}

          {/* Flashcard / Short Answer - Show answer + rating */}
          {(card.question_type === "flashcard" ||
            card.question_type === "short_answer") &&
            answered && (
              <div className="space-y-3">
                <div className="p-3 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                  <p className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">
                    Answer
                  </p>
                  <p className="text-xs whitespace-pre-wrap">{card.answer}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2 text-center">
                    How well did you know this?
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handleRating(1)}
                      disabled={loading}
                    >
                      Again
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handleRating(2)}
                      disabled={loading}
                    >
                      Hard
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handleRating(3)}
                      disabled={loading}
                    >
                      Good
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handleRating(4)}
                      disabled={loading}
                    >
                      Easy
                    </Button>
                  </div>
                </div>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
