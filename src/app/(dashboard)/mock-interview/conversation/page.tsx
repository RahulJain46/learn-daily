"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  startConversation,
  sendTurn,
  submitCode,
  finishConversation,
  abandonConversation,
  getConversation,
} from "@/lib/actions/mock-interview-conversation";
import {
  CONVERSATIONAL_INTERVIEW_CONFIG,
  type ConversationTurn,
  type FinalReport,
  type RunResult,
  type TestCase,
} from "@/lib/types";
import { ConversationChat } from "@/components/mock-interview/conversation-chat";
import { CodeEditorPanel } from "@/components/mock-interview/code-editor-panel";
import { FinalReportView } from "@/components/mock-interview/final-report-view";

type Mode = "dsa" | "system_design";
type Phase = "loading" | "active" | "finishing" | "report" | "error";

/**
 * Pull the embedded code-request marker out of an interviewer turn, if any.
 * Returns null when the turn isn't asking for code.
 */
function extractCodeRequest(content: string): { test_cases: TestCase[] } | null {
  const m = content.match(/<!--CODE_REQUEST:(.+?)-->/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as { test_cases: TestCase[] };
  } catch {
    return null;
  }
}

export default function ConversationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ConversationInner />
    </Suspense>
  );
}

function ConversationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const modeParam = searchParams.get("mode") || "dsa";
  const resumeId = searchParams.get("resume");
  const mode: Mode = modeParam === "system_design" ? "system_design" : "dsa";
  const config = CONVERSATIONAL_INTERVIEW_CONFIG[mode];

  const [phase, setPhase] = useState<Phase>("loading");
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<ConversationTurn[]>([]);
  const [awaiting, setAwaiting] = useState(false);
  const [report, setReport] = useState<FinalReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  const initRef = useRef(false);

  // Bootstrap: either resume an existing conversation or start a new one.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      if (resumeId) {
        const data = await getConversation(resumeId);
        if (!data.interview || !data.interview.conversation_mode) {
          setErrorMsg("That session can't be resumed in conversational mode.");
          setPhase("error");
          return;
        }
        if (data.interview.status === "completed" && data.interview.final_report) {
          setReport(data.interview.final_report as FinalReport);
          setInterviewId(resumeId);
          setPhase("report");
          return;
        }
        setInterviewId(resumeId);
        setTranscript(data.transcript);
        setPhase("active");
        return;
      }

      setAwaiting(true);
      const res = await startConversation(mode);
      setAwaiting(false);
      if (!res.success || !res.interviewId) {
        setErrorMsg(res.error ?? "Failed to start interview");
        setPhase("error");
        return;
      }
      setInterviewId(res.interviewId);
      setTranscript(res.openingTurn ? [res.openingTurn] : []);
      setPhase("active");
    })();
  }, [mode, resumeId]);

  // Most recent interviewer turn — drives the editor's test-case panel.
  const currentCodeRequest = (() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const t = transcript[i];
      if (t.role === "interviewer") {
        return extractCodeRequest(t.content);
      }
      if (t.role === "candidate" && t.code_submission_id) {
        // Once the candidate submitted code for the latest request, lock the editor.
        return null;
      }
    }
    return null;
  })();

  // Identify the prompt turn index for code submissions (the most recent
  // interviewer turn that has a code request and has not yet been answered).
  const promptTurnIndex = (() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const t = transcript[i];
      if (t.role === "interviewer" && extractCodeRequest(t.content)) {
        return t.turn_index;
      }
      if (t.role === "candidate" && t.code_submission_id) return -1;
    }
    return -1;
  })();

  const handleSend = useCallback(
    async (text: string) => {
      if (!interviewId) return;
      setAwaiting(true);
      const res = await sendTurn({ interviewId, candidateMessage: text });
      setAwaiting(false);
      if (!res.success) {
        setErrorMsg(res.error ?? "Failed to send message");
        return;
      }
      setTranscript((prev) => {
        const next = [...prev];
        if (res.candidateTurn) next.push(res.candidateTurn);
        if (res.interviewerTurn) next.push(res.interviewerTurn);
        return next;
      });
      if (res.shouldFinish) {
        await finalize();
      }
    },
    [interviewId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSubmitCode = useCallback(
    async (payload: { code: string; testCases: TestCase[]; runResult: RunResult }) => {
      if (!interviewId || promptTurnIndex < 0) return;
      setAwaiting(true);
      const submission = await submitCode({
        interviewId,
        promptTurnIndex,
        code: payload.code,
        testCases: payload.testCases,
        runResult: payload.runResult,
      });
      if (!submission.success || !submission.submissionId) {
        setAwaiting(false);
        setErrorMsg(submission.error ?? "Could not save submission");
        return;
      }
      const summary = `Ran ${payload.runResult.passed}/${payload.runResult.total} tests in ${payload.runResult.runtime_ms}ms.`;
      const res = await sendTurn({
        interviewId,
        candidateMessage: summary,
        codeSubmissionId: submission.submissionId,
      });
      setAwaiting(false);
      if (!res.success) {
        setErrorMsg(res.error ?? "Failed to record code submission turn");
        return;
      }
      setTranscript((prev) => {
        const next = [...prev];
        if (res.candidateTurn) next.push(res.candidateTurn);
        if (res.interviewerTurn) next.push(res.interviewerTurn);
        return next;
      });
      if (res.shouldFinish) await finalize();
    },
    [interviewId, promptTurnIndex] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const finalize = useCallback(async () => {
    if (!interviewId) return;
    setPhase("finishing");
    const res = await finishConversation(interviewId);
    if (!res.success || !res.report) {
      setErrorMsg(res.error ?? "Failed to generate report");
      setPhase("error");
      return;
    }
    setReport(res.report);
    setPhase("report");
  }, [interviewId]);

  const handleEnd = useCallback(async () => {
    if (transcript.filter((t) => t.role === "candidate").length === 0) {
      // Nothing answered yet — abandon instead of asking AI for a report.
      if (interviewId) await abandonConversation(interviewId);
      router.push("/mock-interview");
      return;
    }
    await finalize();
  }, [transcript, interviewId, finalize, router]);

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
        <button
          onClick={() => router.push("/mock-interview")}
          className="text-sm underline text-muted-foreground"
        >
          Back to mock interview
        </button>
      </div>
    );
  }

  if (phase === "finishing") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Generating your Staff+ report…
        </p>
      </div>
    );
  }

  if (phase === "report" && report) {
    return <FinalReportView report={report} modeLabel={config.label} />;
  }

  // Active session
  return (
    <div
      className={
        // Negate the dashboard layout's padding so the split-view fills the screen.
        // Dashboard layout uses container padding; we lock to viewport height
        // minus the top bar.
        "fixed inset-0 top-14 grid bg-background " +
        (config.codeEditor ? "md:grid-cols-2" : "grid-cols-1")
      }
    >
      <div className="min-h-0">
        <ConversationChat
          transcript={transcript}
          awaitingResponse={awaiting}
          onSend={handleSend}
          onEnd={handleEnd}
          ttsEnabled={ttsEnabled}
          onToggleTts={() => setTtsEnabled((v) => !v)}
        />
      </div>
      {config.codeEditor && (
        <div className="min-h-0 hidden md:block">
          <CodeEditorPanel
            testCases={currentCodeRequest?.test_cases ?? null}
            disabled={phase !== "active"}
            submitInFlight={awaiting}
            onSubmit={handleSubmitCode}
          />
        </div>
      )}
    </div>
  );
}
