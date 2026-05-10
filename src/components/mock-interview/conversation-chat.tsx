"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConversationTurn } from "@/lib/types";
import { useVoice } from "@/lib/use-voice";

/**
 * Strip the embedded code-request marker from interviewer messages before
 * rendering. The marker shape is matched by the server action.
 */
function visibleMessage(content: string): string {
  return content.replace(/\n*<!--CODE_REQUEST:[^>]*-->/, "").trim();
}

interface Props {
  transcript: ConversationTurn[];
  /** True while we're waiting for the AI's next turn. */
  awaitingResponse: boolean;
  /** Disable the composer (session over, etc.). */
  disabled?: boolean;
  onSend: (text: string) => void;
  /** Called when the user clicks "End interview". */
  onEnd: () => void;
  /** Stream the latest interviewer turn into the speech synthesizer? */
  ttsEnabled: boolean;
  onToggleTts: () => void;
}

export function ConversationChat({
  transcript,
  awaitingResponse,
  disabled,
  onSend,
  onEnd,
  ttsEnabled,
  onToggleTts,
}: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSpokenIdRef = useRef<string | null>(null);

  const voice = useVoice({
    onFinalTranscript: (text) => {
      // When the mic stops, append (don't replace) so the user can correct
      // by typing before sending.
      setDraft((prev) => (prev.trim() ? prev.trim() + " " + text : text));
    },
  });

  // Auto-scroll to the latest turn.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [transcript.length, awaitingResponse]);

  // Speak the latest interviewer turn (only once per turn).
  useEffect(() => {
    if (!ttsEnabled || !voice.synthesisSupported) return;
    const last = transcript[transcript.length - 1];
    if (!last || last.role !== "interviewer") return;
    if (lastSpokenIdRef.current === last.id) return;
    lastSpokenIdRef.current = last.id;
    voice.speak(visibleMessage(last.content));
  }, [transcript, ttsEnabled, voice]);

  function handleSend() {
    const text = draft.trim();
    if (!text || awaitingResponse || disabled) return;
    onSend(text);
    setDraft("");
    voice.cancelSpeech();
  }

  function handleMicClick() {
    if (voice.isListening) voice.stopListening();
    else voice.startListening();
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-sm font-medium">Interview transcript</div>
        <div className="flex items-center gap-2">
          {voice.synthesisSupported && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleTts}
              title={ttsEnabled ? "Mute interviewer voice" : "Enable interviewer voice"}
            >
              {ttsEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onEnd} disabled={disabled}>
            End interview
          </Button>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {transcript.length === 0 && !awaitingResponse && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Waiting for the interviewer to start…
          </div>
        )}
        {transcript.map((t) => {
          const text = visibleMessage(t.content);
          if (!text && t.role !== "candidate") return null;
          return (
            <div
              key={t.id}
              className={cn(
                "flex",
                t.role === "candidate" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  t.role === "interviewer" &&
                    "bg-accent text-accent-foreground",
                  t.role === "candidate" &&
                    "bg-primary text-primary-foreground",
                  t.role === "system" &&
                    "bg-muted text-muted-foreground italic text-xs"
                )}
              >
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                  {t.role}
                </div>
                {text}
                {t.code_submission_id && t.role === "candidate" && (
                  <Badge
                    variant="secondary"
                    className="mt-2 text-[10px] bg-background/30"
                  >
                    code submitted
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
        {awaitingResponse && (
          <div className="flex justify-start">
            <div className="bg-accent text-accent-foreground rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Interviewer is thinking…
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3 space-y-2">
        {voice.error && (
          <div className="text-xs text-red-600 dark:text-red-400">
            {voice.error}
          </div>
        )}
        {!voice.recognitionSupported && (
          <div className="text-[11px] text-muted-foreground">
            Voice input isn&apos;t supported in this browser — typing only.
          </div>
        )}
        {/*
          While the mic is on we render a separate preview pane for the live
          transcript and freeze the textarea, so the user never sees their
          previous draft concatenated with the in-flight dictation. When the
          mic stops, useVoice's `onFinalTranscript` appends the recognized
          text to `draft` exactly once.
        */}
        {voice.isListening && (
          <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <div className="text-[10px] uppercase tracking-wide text-primary/80 mb-1">
              Listening
            </div>
            <div className="min-h-[1.25rem] whitespace-pre-wrap">
              {voice.liveTranscript || (
                <span className="text-muted-foreground italic">…</span>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              voice.isListening
                ? "Listening above… click mic to stop and append."
                : "Type your answer, or click the mic to speak. Cmd/Ctrl+Enter to send."
            }
            disabled={disabled || awaitingResponse || voice.isListening}
            className="min-h-[60px] resize-none"
          />
          <div className="flex flex-col gap-2">
            {voice.recognitionSupported && (
              <Button
                size="icon"
                variant={voice.isListening ? "default" : "outline"}
                onClick={handleMicClick}
                disabled={disabled || awaitingResponse}
                className={cn(voice.isListening && "animate-pulse")}
                title={voice.isListening ? "Stop listening" : "Start voice input"}
              >
                {voice.isListening ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              size="icon"
              onClick={handleSend}
              disabled={
                !draft.trim() || awaitingResponse || disabled
              }
              title="Send"
            >
              {awaitingResponse ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
