"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { LinkButton } from "@/components/ui/link-button";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Trophy,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { EvaluationCard } from "@/components/quiz/evaluation-card";
import { evaluateAnswer, type AnswerEvaluation } from "@/lib/actions/evaluate-answer";
import { Sparkles } from "lucide-react";

type SessionState = "loading" | "answering" | "feedback" | "complete";

interface CardData {
  id: string;
  question_type: string;
  question: string;
  options: { text: string; isCorrect: boolean }[] | null;
  answer: string;
  entry?: {
    category: string | null;
    subcategory: string | null;
    difficulty: string | null;
  } | null;
}

export default function RevisionSessionPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-muted-foreground">Loading session...</div>}>
      <RevisionSession />
    </Suspense>
  );
}

function suggestedRating(score: number): 1 | 2 | 3 | 4 {
  if (score >= 85) return 4;
  if (score >= 65) return 3;
  if (score >= 40) return 2;
  return 1;
}

function suggestedRatingLabel(score: number): string {
  const r = suggestedRating(score);
  return r === 1 ? "Again" : r === 2 ? "Hard" : r === 3 ? "Good" : "Easy";
}

function RevisionSession() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "random";
  const category = searchParams.get("category");
  const [cards, setCards] = useState<CardData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [shortAnswer, setShortAnswer] = useState("");
  const [results, setResults] = useState<{ cardId: string; correct: boolean }[]>([]);
  const [timer, setTimer] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  useEffect(() => {
    loadCards();
  }, [mode, category]);

  useEffect(() => {
    if (sessionState === "complete" || sessionState === "loading") return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [sessionState]);

  const loadCards = async () => {
    const supabase = createClient();
    let query = supabase
      .from("cards")
      .select("id, question_type, question, options, answer, entry:entries(category, subcategory, difficulty)");

    if (mode === "due") {
      query = query.lte("due", new Date().toISOString());
    } else if (mode === "topic" && category) {
      const { data: entries } = await supabase
        .from("entries")
        .select("id")
        .eq("category", category);
      const entryIds = entries?.map((e) => e.id) || [];
      if (entryIds.length > 0) {
        query = query.in("entry_id", entryIds);
      }
    }

    const { data } = await query.limit(20);

    if (data && data.length > 0) {
      const normalized: CardData[] = data.map((c: Record<string, unknown>) => {
        const rawEntry = c.entry as
          | { category: string | null; subcategory: string | null; difficulty: string | null }
          | { category: string | null; subcategory: string | null; difficulty: string | null }[]
          | null;
        const entry = Array.isArray(rawEntry) ? rawEntry[0] ?? null : rawEntry;
        return {
          id: c.id as string,
          question_type: c.question_type as string,
          question: c.question as string,
          options: (c.options as CardData["options"]) ?? null,
          answer: c.answer as string,
          entry,
        };
      });
      const shuffled = mode === "random" ? normalized.sort(() => Math.random() - 0.5) : normalized;
      setCards(shuffled);
      setSessionState("answering");
    } else {
      setCards([]);
      setSessionState("complete");
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSubmitMCQ = () => {
    if (selectedOption === null || !currentCard.options) return;
    const isCorrect = currentCard.options[selectedOption].isCorrect;
    setResults([...results, { cardId: currentCard.id, correct: isCorrect }]);
    setSessionState("feedback");
  };

  const handleSubmitShortAnswer = async () => {
    setResults([...results, { cardId: currentCard.id, correct: true }]);
    setSessionState("feedback");
    setEvaluation(null);
    setEvalError(null);
    setEvalLoading(true);
    try {
      const res = await evaluateAnswer({
        cardId: currentCard.id,
        question: currentCard.question,
        modelAnswer: currentCard.answer,
        userAnswer: shortAnswer,
        questionType: currentCard.question_type as "short_answer" | "flashcard",
        category: currentCard.entry?.category ?? null,
        subcategory: currentCard.entry?.subcategory ?? null,
        difficulty: currentCard.entry?.difficulty ?? null,
        sessionId,
      });
      if (res.success) {
        setEvaluation(res.evaluation);
      } else {
        setEvalError(res.error);
      }
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setEvalLoading(false);
    }
  };

  const handleRating = async (rating: 1 | 2 | 3 | 4) => {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

    await supabase.from("card_reviews").insert({
      user_id: userId,
      card_id: currentCard.id,
      session_id: sessionId,
      user_answer: shortAnswer || (selectedOption !== null && currentCard.options ? currentCard.options[selectedOption].text : null),
      rating,
    });

    const daysMap: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 7 };
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + daysMap[rating]);

    await supabase
      .from("cards")
      .update({
        due: nextDue.toISOString(),
        last_review: new Date().toISOString(),
        reps: cards[currentIndex] ? 1 : 0,
      })
      .eq("id", currentCard.id);

    handleNext();
  };

  const handleNext = () => {
    if (currentIndex + 1 >= cards.length) {
      saveSession();
      setSessionState("complete");
    } else {
      setCurrentIndex(currentIndex + 1);
      setSessionState("answering");
      setSelectedOption(null);
      setShortAnswer("");
      setEvaluation(null);
      setEvalError(null);
      setEvalLoading(false);
    }
  };

  const saveSession = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

    const correctCount = results.filter((r) => r.correct).length;
    const { data } = await supabase
      .from("revision_sessions")
      .insert({
        user_id: userId,
        mode,
        category: category || null,
        cards_reviewed: results.length,
        correct_count: correctCount,
        duration_seconds: timer,
      })
      .select()
      .single();

    if (data) setSessionId(data.id);
  };

  if (sessionState === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessionState === "complete" && cards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <h2 className="text-xl font-bold">No Cards Available</h2>
            <p className="text-sm text-muted-foreground">
              {mode === "due"
                ? "No cards are due for review right now. Great job staying on top!"
                : "No cards found for this mode. Add some entries and cards first."}
            </p>
            <LinkButton href="/revise">Back to Modes</LinkButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sessionState === "complete") {
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Trophy className="h-8 w-8 text-green-600 dark:text-green-300" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Session Complete!</h2>
              <p className="text-muted-foreground mt-1">
                Great work keeping up with your revision.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-accent">
                <p className="text-2xl font-bold">{results.length}</p>
                <p className="text-xs text-muted-foreground">Cards Reviewed</p>
              </div>
              <div className="p-4 rounded-lg bg-accent">
                <p className="text-2xl font-bold">{accuracy}%</p>
                <p className="text-xs text-muted-foreground">Accuracy</p>
              </div>
              <div className="p-4 rounded-lg bg-accent">
                <p className="text-2xl font-bold">{formatTime(timer)}</p>
                <p className="text-xs text-muted-foreground">Time Taken</p>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <LinkButton href="/revise" variant="outline">
                Back to Modes
              </LinkButton>
              <LinkButton href="/">Dashboard</LinkButton>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const progress = (currentIndex / cards.length) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Session Header */}
      <div className="flex items-center justify-between">
        <LinkButton href="/revise" variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Exit
        </LinkButton>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            Card {currentIndex + 1} of {cards.length}
          </span>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatTime(timer)}
          </div>
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      {/* Question Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Badge variant="secondary">
              {currentCard.question_type === "mcq"
                ? "Multiple Choice"
                : currentCard.question_type === "flashcard"
                ? "Flashcard"
                : "Short Answer"}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {mode}
            </Badge>
          </div>
          <CardTitle className="text-lg mt-4 leading-relaxed">
            {currentCard.question}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* MCQ Options */}
          {currentCard.question_type === "mcq" &&
            currentCard.options &&
            sessionState === "answering" && (
              <div className="space-y-3">
                {currentCard.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedOption(index)}
                    className={cn(
                      "w-full text-left p-4 rounded-lg border-2 transition-colors",
                      selectedOption === index
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className="text-sm">{option.text}</span>
                  </button>
                ))}
                <Button
                  onClick={handleSubmitMCQ}
                  disabled={selectedOption === null}
                  className="w-full mt-4"
                >
                  Submit Answer
                </Button>
              </div>
            )}

          {/* Short Answer / Flashcard Input */}
          {(currentCard.question_type === "short_answer" || currentCard.question_type === "flashcard") &&
            sessionState === "answering" && (
              <div className="space-y-4">
                <Textarea
                  placeholder="Type your answer here..."
                  value={shortAnswer}
                  onChange={(e) => setShortAnswer(e.target.value)}
                  className="min-h-[120px]"
                />
                <Button
                  onClick={handleSubmitShortAnswer}
                  disabled={!shortAnswer.trim()}
                  className="w-full"
                >
                  Submit Answer
                </Button>
              </div>
            )}

          {/* Feedback State */}
          {sessionState === "feedback" && (
            <div className="space-y-4">
              {currentCard.question_type === "mcq" && currentCard.options && (
                <div className="space-y-3">
                  {currentCard.options.map((option, index) => (
                    <div
                      key={index}
                      className={cn(
                        "p-4 rounded-lg border-2",
                        option.isCorrect
                          ? "border-green-500 bg-green-50 dark:bg-green-950"
                          : selectedOption === index
                          ? "border-red-500 bg-red-50 dark:bg-red-950"
                          : "border-border opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {option.isCorrect && (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                        {!option.isCorrect && selectedOption === index && (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-sm">{option.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(currentCard.question_type === "short_answer" || currentCard.question_type === "flashcard") && (
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-accent border border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Your Answer
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{shortAnswer}</p>
                  </div>

                  <EvaluationCard
                    evaluation={evaluation}
                    loading={evalLoading}
                    error={evalError}
                  />

                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <p className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">
                      Model Answer
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{currentCard.answer}</p>
                  </div>
                </div>
              )}

              <Separator />

              <div>
                <p className="text-sm font-medium mb-1 text-center">
                  How well did you know this?
                </p>
                {evaluation && (
                  <p className="text-xs text-muted-foreground mb-3 text-center flex items-center justify-center gap-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    AI suggests:{" "}
                    <span className="font-medium">
                      {suggestedRatingLabel(evaluation.overall_score)}
                    </span>
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {([1, 2, 3, 4] as const).map((r) => {
                    const suggested =
                      evaluation && suggestedRating(evaluation.overall_score) === r;
                    return (
                      <Button
                        key={r}
                        variant={suggested ? "default" : "outline"}
                        onClick={() => handleRating(r)}
                        className="text-xs"
                      >
                        {r === 1 ? "Again" : r === 2 ? "Hard" : r === 3 ? "Good" : "Easy"}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
