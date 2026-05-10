"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { LinkButton } from "@/components/ui/link-button";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Trophy,
  ArrowLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MOCK_INTERVIEW_CONFIG } from "@/lib/types";
import type { MockInterviewMode } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionPhase = "loading" | "ready" | "answering" | "explaining" | "feedback" | "complete" | "timeout";

interface QuestionData {
  id: string;
  card_id: string;
  question_order: number;
  cards: {
    id: string;
    question_type: string;
    question: string;
    options: { text: string; isCorrect: boolean }[] | null;
    answer: string;
  };
  user_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
}

export default function MockInterviewSessionPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <MockInterviewSession />
    </Suspense>
  );
}

function MockInterviewSession() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = (searchParams.get("mode") || "mixed") as MockInterviewMode;
  const resumeId = searchParams.get("resume");

  const config = MOCK_INTERVIEW_CONFIG[mode];

  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [interviewId, setInterviewId] = useState<string | null>(resumeId);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [explanation, setExplanation] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(config?.timeMinutes * 60 || 1800);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [results, setResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });

  // Timer
  useEffect(() => {
    if (phase !== "answering" && phase !== "explaining" && phase !== "feedback") return;
    if (timeRemaining <= 0) {
      setPhase("timeout");
      handleComplete();
      return;
    }
    const interval = setInterval(() => {
      setTimeRemaining((t) => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, timeRemaining]);

  // Initialize session
  useEffect(() => {
    if (resumeId) {
      loadExistingSession(resumeId);
    } else {
      startNewSession();
    }
  }, []);

  const startNewSession = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

    // Fetch cards
    let cardsQuery = supabase.from("cards").select("id");
    if (mode === "dsa") {
      const { data: entries } = await supabase.from("entries").select("id").eq("category", "dsa");
      const ids = entries?.map((e) => e.id) || [];
      if (ids.length > 0) cardsQuery = cardsQuery.in("entry_id", ids);
    } else if (mode === "system_design") {
      const { data: entries } = await supabase.from("entries").select("id").in("category", ["system_design", "backend"]);
      const ids = entries?.map((e) => e.id) || [];
      if (ids.length > 0) cardsQuery = cardsQuery.in("entry_id", ids);
    }

    const { data: allCards } = await cardsQuery;
    if (!allCards || allCards.length === 0) {
      setPhase("complete");
      return;
    }

    const shuffled = allCards.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(config.questionCount, shuffled.length));

    // Create interview
    const { data: interview } = await supabase
      .from("mock_interviews")
      .insert({
        user_id: userId,
        mode,
        time_limit_minutes: config.timeMinutes,
        total_questions: selected.length,
      })
      .select()
      .single();

    if (!interview) return;
    setInterviewId(interview.id);

    // Insert questions
    const questionInserts = selected.map((card, idx) => ({
      mock_interview_id: interview.id,
      card_id: card.id,
      question_order: idx + 1,
    }));

    await supabase.from("mock_interview_questions").insert(questionInserts);

    // Load the questions with card data
    await loadExistingSession(interview.id);
  };

  const loadExistingSession = async (id: string) => {
    const supabase = createClient();

    const { data: interview } = await supabase
      .from("mock_interviews")
      .select("*")
      .eq("id", id)
      .single();

    if (!interview || interview.status === "completed") {
      router.push("/mock-interview");
      return;
    }

    const { data: qs } = await supabase
      .from("mock_interview_questions")
      .select("*, cards(id, question_type, question, options, answer)")
      .eq("mock_interview_id", id)
      .order("question_order", { ascending: true });

    if (!qs || qs.length === 0) {
      setPhase("complete");
      return;
    }

    setQuestions(qs as unknown as QuestionData[]);
    setInterviewId(id);

    // Find first unanswered question
    const firstUnanswered = qs.findIndex((q) => !q.answered_at);
    const idx = firstUnanswered >= 0 ? firstUnanswered : qs.length;

    if (idx >= qs.length) {
      setPhase("complete");
      handleComplete();
    } else {
      setCurrentIndex(idx);
      setResults({
        correct: qs.filter((q) => q.is_correct).length,
        total: qs.filter((q) => q.answered_at).length,
      });
      // Estimate remaining time
      const elapsed = interview.time_limit_minutes * 60 -
        Math.floor((Date.now() - new Date(interview.started_at).getTime()) / 1000);
      setTimeRemaining(Math.max(0, elapsed));
      setPhase("answering");
      setQuestionStartTime(Date.now());
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSubmitMCQ = () => {
    if (selectedOption === null) return;
    setPhase("explaining");
  };

  const handleSubmitShortAnswer = () => {
    setPhase("explaining");
  };

  const handleSubmitExplanation = async () => {
    const currentQuestion = questions[currentIndex];
    const card = currentQuestion.cards;
    const timeTaken = Math.floor((Date.now() - questionStartTime) / 1000);

    let isCorrect = false;
    let userAnswer = "";

    if (card.question_type === "mcq" && card.options && selectedOption !== null) {
      isCorrect = card.options[selectedOption].isCorrect;
      userAnswer = card.options[selectedOption].text;
    } else {
      userAnswer = explanation;
      isCorrect = false; // Self-evaluated in feedback phase
    }

    // Save to DB
    const supabase = createClient();
    await supabase
      .from("mock_interview_questions")
      .update({
        user_answer: userAnswer,
        explanation: card.question_type !== "mcq" ? explanation : explanation,
        is_correct: isCorrect,
        time_taken_seconds: timeTaken,
        answered_at: new Date().toISOString(),
      })
      .eq("id", currentQuestion.id);

    setResults((r) => ({
      correct: r.correct + (isCorrect ? 1 : 0),
      total: r.total + 1,
    }));

    setPhase("feedback");
  };

  const handleSelfRate = async (correct: boolean) => {
    const currentQuestion = questions[currentIndex];

    // Update the is_correct field for non-MCQ
    const supabase = createClient();
    await supabase
      .from("mock_interview_questions")
      .update({ is_correct: correct })
      .eq("id", currentQuestion.id);

    if (correct) {
      setResults((r) => ({ ...r, correct: r.correct + 1 }));
    }

    handleNext();
  };

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      handleComplete();
      setPhase("complete");
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
      setExplanation("");
      setQuestionStartTime(Date.now());
      setPhase("answering");
    }
  };

  const handleComplete = useCallback(async () => {
    if (!interviewId) return;
    const supabase = createClient();

    const { data: qs } = await supabase
      .from("mock_interview_questions")
      .select("is_correct")
      .eq("mock_interview_id", interviewId)
      .not("answered_at", "is", null);

    const answered = qs?.length || 0;
    const correct = qs?.filter((q) => q.is_correct).length || 0;
    const score = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    await supabase
      .from("mock_interviews")
      .update({
        status: "completed",
        questions_answered: answered,
        correct_count: correct,
        score_percent: score,
        completed_at: new Date().toISOString(),
      })
      .eq("id", interviewId);
  }, [interviewId]);

  const handleAbandon = async () => {
    if (!interviewId) return;
    const supabase = createClient();
    await supabase
      .from("mock_interviews")
      .update({ status: "abandoned", completed_at: new Date().toISOString() })
      .eq("id", interviewId);
    router.push("/mock-interview");
  };

  // Loading
  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Timeout
  if (phase === "timeout") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 mx-auto text-orange-500" />
            <h2 className="text-xl font-bold">Time&apos;s Up!</h2>
            <p className="text-sm text-muted-foreground">
              You answered {results.total} of {questions.length} questions.
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
              <div className="p-4 rounded-lg bg-accent">
                <p className="text-2xl font-bold">{results.correct}</p>
                <p className="text-xs text-muted-foreground">Correct</p>
              </div>
              <div className="p-4 rounded-lg bg-accent">
                <p className="text-2xl font-bold">
                  {results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Accuracy</p>
              </div>
            </div>
            <LinkButton href="/mock-interview">Back to Mock Interview</LinkButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Complete
  if (phase === "complete") {
    const accuracy = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Trophy className="h-8 w-8 text-green-600 dark:text-green-300" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Interview Complete!</h2>
              <p className="text-muted-foreground mt-1">
                {accuracy >= 70 ? "Great performance!" : "Keep practicing — you'll get there!"}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-accent">
                <p className="text-2xl font-bold">{results.total}</p>
                <p className="text-xs text-muted-foreground">Answered</p>
              </div>
              <div className="p-4 rounded-lg bg-accent">
                <p className="text-2xl font-bold">{accuracy}%</p>
                <p className="text-xs text-muted-foreground">Accuracy</p>
              </div>
              <div className="p-4 rounded-lg bg-accent">
                <p className="text-2xl font-bold">
                  {formatTime((config?.timeMinutes * 60 || 1800) - timeRemaining)}
                </p>
                <p className="text-xs text-muted-foreground">Time Used</p>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <LinkButton href="/mock-interview" variant="outline">
                Back to Modes
              </LinkButton>
              <LinkButton href="/">Dashboard</LinkButton>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Active session
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;
  const card = currentQuestion.cards;
  const progress = (currentIndex / questions.length) * 100;
  const isLowTime = timeRemaining < 120;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleAbandon}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Exit
        </Button>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="capitalize">
            {config?.label}
          </Badge>
          <div className={cn(
            "flex items-center gap-1 text-sm font-mono",
            isLowTime ? "text-red-600 dark:text-red-400 animate-pulse" : "text-muted-foreground"
          )}>
            <Clock className="h-4 w-4" />
            {formatTime(timeRemaining)}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Question {currentIndex + 1} of {questions.length}</span>
          <span>{results.correct}/{results.total} correct</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Question */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Badge variant="secondary">
              {card.question_type === "mcq" ? "Multiple Choice" : card.question_type === "flashcard" ? "Flashcard" : "Short Answer"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Q{currentQuestion.question_order}
            </span>
          </div>
          <CardTitle className="text-lg mt-3 leading-relaxed">
            {card.question}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* MCQ - Answering */}
          {card.question_type === "mcq" && card.options && phase === "answering" && (
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
                onClick={handleSubmitMCQ}
                disabled={selectedOption === null}
                className="w-full mt-2"
              >
                Submit Answer
              </Button>
            </div>
          )}

          {/* Short Answer / Flashcard - Answering */}
          {(card.question_type === "short_answer" || card.question_type === "flashcard") &&
            phase === "answering" && (
              <div className="space-y-4">
                <Textarea
                  placeholder="Type your answer here..."
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="min-h-[120px]"
                />
                <Button
                  onClick={handleSubmitShortAnswer}
                  disabled={!explanation.trim()}
                  className="w-full"
                >
                  Submit Answer
                </Button>
              </div>
            )}

          {/* Explaining Phase (MCQ only - explain why) */}
          {phase === "explaining" && card.question_type === "mcq" && (
            <div className="space-y-4">
              <Separator />
              <div className="p-3 rounded-lg bg-accent/50 border border-border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Your answer</p>
                <p className="text-sm">{card.options?.[selectedOption!]?.text}</p>
              </div>
              <div>
                <label className="text-sm font-medium">
                  Explain your reasoning (like in a real interview):
                </label>
                <Textarea
                  placeholder="Why did you choose this answer? Explain your thought process..."
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="min-h-[100px] mt-2"
                />
              </div>
              <Button onClick={handleSubmitExplanation} className="w-full">
                Continue
              </Button>
            </div>
          )}

          {/* Explaining Phase (short answer - already has answer) */}
          {phase === "explaining" && card.question_type !== "mcq" && (
            <div className="space-y-4">
              <Separator />
              <div className="p-3 rounded-lg bg-accent/50 border border-border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Your answer</p>
                <p className="text-sm whitespace-pre-wrap">{explanation}</p>
              </div>
              <Button onClick={handleSubmitExplanation} className="w-full">
                See Model Answer
              </Button>
            </div>
          )}

          {/* Feedback Phase */}
          {phase === "feedback" && (
            <div className="space-y-4">
              {/* Show MCQ result */}
              {card.question_type === "mcq" && card.options && (
                <div className="space-y-2">
                  {card.options.map((option, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "p-3 rounded-lg border-2 text-sm flex items-center gap-2",
                        option.isCorrect
                          ? "border-green-500 bg-green-50 dark:bg-green-950"
                          : selectedOption === idx
                          ? "border-red-500 bg-red-50 dark:bg-red-950"
                          : "border-border opacity-50"
                      )}
                    >
                      {option.isCorrect && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                      {!option.isCorrect && selectedOption === idx && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                      {option.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Model answer */}
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <p className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">
                  Model Answer
                </p>
                <p className="text-sm whitespace-pre-wrap">{card.answer}</p>
              </div>

              {/* Self-rate for non-MCQ */}
              {card.question_type !== "mcq" ? (
                <div>
                  <p className="text-sm font-medium mb-3 text-center">
                    Was your answer correct?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" onClick={() => handleSelfRate(false)}>
                      <XCircle className="h-4 w-4 mr-2 text-red-500" />
                      Incorrect
                    </Button>
                    <Button variant="outline" onClick={() => handleSelfRate(true)}>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                      Correct
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={handleNext} className="w-full">
                  {currentIndex + 1 >= questions.length ? "Finish Interview" : "Next Question"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
