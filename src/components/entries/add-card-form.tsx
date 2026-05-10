"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, X } from "lucide-react";
import { createCard } from "@/lib/actions/cards";
import type { QuestionType } from "@/lib/types";

export function AddCardForm({ entryId }: { entryId: string }) {
  const [open, setOpen] = useState(false);
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [options, setOptions] = useState([
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setQuestion("");
    setAnswer("");
    setQuestionType("mcq");
    setOptions([
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ]);
  };

  const handleSave = async () => {
    if (!question) return;

    setSaving(true);
    try {
      await createCard({
        entry_id: entryId,
        question_type: questionType,
        question,
        options: questionType === "mcq" ? options.filter((o) => o.text) : null,
        answer:
          questionType === "mcq"
            ? options.find((o) => o.isCorrect)?.text || ""
            : answer,
      });
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const updateOption = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], text };
    setOptions(newOptions);
  };

  const setCorrectOption = (index: number) => {
    const newOptions = options.map((opt, i) => ({
      ...opt,
      isCorrect: i === index,
    }));
    setOptions(newOptions);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <Plus className="mr-2 h-4 w-4" />
        Add Card
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Revision Card</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Type</label>
            <Select
              value={questionType}
              onValueChange={(v) => setQuestionType((v ?? "mcq") as QuestionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mcq">Multiple Choice (MCQ)</SelectItem>
                <SelectItem value="short_answer">Short Answer</SelectItem>
                <SelectItem value="flashcard">Flashcard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              {questionType === "flashcard" ? "Front (Topic/Title)" : "Question"}
            </label>
            <Textarea
              placeholder={
                questionType === "flashcard"
                  ? "e.g., Binary Search"
                  : "e.g., What is the time complexity?"
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {questionType === "mcq" && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Options (click to mark correct)
              </label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectOption(i)}
                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                        opt.isCorrect
                          ? "bg-green-500 border-green-500"
                          : "border-muted-foreground/40"
                      }`}
                    />
                    <Input
                      placeholder={`Option ${i + 1}`}
                      value={opt.text}
                      onChange={(e) => updateOption(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {(questionType === "short_answer" || questionType === "flashcard") && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {questionType === "flashcard" ? "Back (Content/Answer)" : "Model Answer"}
              </label>
              <Textarea
                placeholder={
                  questionType === "flashcard"
                    ? "Detailed explanation, key points, etc."
                    : "The expected answer..."
                }
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!question || saving}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add Card
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
