"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Shuffle,
  CheckCircle2,
  XCircle,
  Loader2,
  SkipForward,
} from "lucide-react";
import { CATEGORY_CONFIG } from "@/lib/types";

interface QuizCard {
  id: string;
  question_type: string;
  question: string;
  options: { text: string; isCorrect: boolean }[] | null;
  answer: string;
}

export default function QuickQuizPage() {
  const [card, setCard] = useState<QuizCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  const [started, setStarted] = useState(false);

  const fetchCard = useCallback(async () => {
    setLoading(true);
    setSelectedOption(null);
    setAnswered(false);
    try {
      const params = category !== "all" ? `?category=${category}` : "";
      const res = await fetch(`/api/quiz/random${params}`);
      const data = await res.json();
      setCard(data.card);
      if (!started) setStarted(true);
    } catch {
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [category, started]);

  const handleSubmitMCQ = async () => {
    if (selectedOption === null || !card?.options) return;
    setAnswered(true);
    const isCorrect = card.options[selectedOption].isCorrect;
    const rating = isCorrect ? 3 : 1;
    setStats((s) => ({
      total: s.total + 1,
      correct: s.correct + (isCorrect ? 1 : 0),
    }));
    await submitAnswer(rating);
  };

  const handleReveal = () => {
    setAnswered(true);
  };

  const handleRating = async (rating: 1 | 2 | 3 | 4) => {
    setStats((s) => ({
      total: s.total + 1,
      correct: s.correct + (rating >= 3 ? 1 : 0),
    }));
    await submitAnswer(rating);
    fetchCard();
  };

  const submitAnswer = async (rating: 1 | 2 | 3 | 4) => {
    if (!card) return;
    setSubmitting(true);
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
      setSubmitting(false);
    }
  };

  const accuracy =
    stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <LinkButton href="/revise" variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </LinkButton>
        {started && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{stats.total} answered</span>
            <span>{accuracy}% accuracy</span>
          </div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quick Quiz</h1>
        <p className="text-muted-foreground text-sm">
          Random questions, one at a time. No pressure.
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-3">
        <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={fetchCard} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Shuffle className="h-4 w-4 mr-2" />
          )}
          {!started ? "Start" : "Next Question"}
        </Button>
      </div>

      {/* Question Card */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && started && !card && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No cards available for this category. Try a different one or add
              some entries first!
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && card && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="secondary">
                {card.question_type === "mcq"
                  ? "Multiple Choice"
                  : card.question_type === "flashcard"
                  ? "Flashcard"
                  : "Short Answer"}
              </Badge>
              {!answered && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchCard}
                  className="text-xs text-muted-foreground"
                >
                  <SkipForward className="h-3 w-3 mr-1" />
                  Skip
                </Button>
              )}
            </div>
            <CardTitle className="text-lg mt-3 leading-relaxed">
              {card.question}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* MCQ - Answering */}
            {card.question_type === "mcq" && card.options && !answered && (
              <div className="space-y-3">
                {card.options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedOption(idx)}
                    className={cn(
                      "w-full text-left p-4 rounded-lg border-2 transition-colors text-sm",
                      selectedOption === idx
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {option.text}
                  </button>
                ))}
                <Button
                  className="w-full mt-2"
                  disabled={selectedOption === null || submitting}
                  onClick={handleSubmitMCQ}
                >
                  {submitting && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Submit Answer
                </Button>
              </div>
            )}

            {/* MCQ - Feedback */}
            {card.question_type === "mcq" && card.options && answered && (
              <div className="space-y-3">
                {card.options.map((option, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "p-4 rounded-lg border-2 text-sm flex items-center gap-2",
                      option.isCorrect
                        ? "border-green-500 bg-green-50 dark:bg-green-950"
                        : selectedOption === idx
                        ? "border-red-500 bg-red-50 dark:bg-red-950"
                        : "border-border opacity-50"
                    )}
                  >
                    {option.isCorrect && (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    )}
                    {!option.isCorrect && selectedOption === idx && (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                    )}
                    {option.text}
                  </div>
                ))}
                <Button className="w-full mt-4" onClick={fetchCard}>
                  Next Question
                </Button>
              </div>
            )}

            {/* Flashcard / Short Answer - Reveal */}
            {(card.question_type === "flashcard" ||
              card.question_type === "short_answer") &&
              !answered && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleReveal}
                >
                  Reveal Answer
                </Button>
              )}

            {/* Flashcard / Short Answer - Rating */}
            {(card.question_type === "flashcard" ||
              card.question_type === "short_answer") &&
              answered && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <p className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">
                      Answer
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{card.answer}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-3 text-center">
                      How well did you know this?
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleRating(1)}
                        disabled={submitting}
                        className="text-xs"
                      >
                        Again
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleRating(2)}
                        disabled={submitting}
                        className="text-xs"
                      >
                        Hard
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleRating(3)}
                        disabled={submitting}
                        className="text-xs"
                      >
                        Good
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleRating(4)}
                        disabled={submitting}
                        className="text-xs"
                      >
                        Easy
                      </Button>
                    </div>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* Not started state */}
      {!started && !loading && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Shuffle className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              Pick a category (or leave it on &quot;All&quot;) and hit Start to
              get your first question.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
