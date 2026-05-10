"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, CheckCircle2, XCircle, Send, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RunResult, TestCase } from "@/lib/types";
import { createSandboxRunner, type SandboxRunner } from "@/lib/sandbox-runner";

/**
 * Monaco is heavy + browser-only. Dynamic import keeps it out of the SSR
 * bundle and avoids hydration mismatches.
 */
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading editor…
    </div>
  ),
});

const STARTER_CODE = `// Define a function named "solution".
// The harness will call it with the test-case args and compare the return value.
//
// Example:
//   function solution(nums, target) {
//     // ... your code ...
//     return result;
//   }

function solution() {
  // your code here
}
`;

interface Props {
  /**
   * Test cases injected by the interviewer for the current coding question.
   * When null/empty the editor is read-only with a "waiting for question" hint.
   */
  testCases: TestCase[] | null;
  /** Disable everything (e.g. session is over). */
  disabled?: boolean;
  /**
   * Called when the user clicks "Submit & continue" — passes the latest
   * code, the test cases, and the most recent run result. Parent persists
   * the submission and asks the AI for the next turn.
   */
  onSubmit: (payload: {
    code: string;
    testCases: TestCase[];
    runResult: RunResult;
  }) => void;
  /** Whether a submit is in flight (parent waiting on AI). */
  submitInFlight?: boolean;
}

export function CodeEditorPanel({
  testCases,
  disabled,
  onSubmit,
  submitInFlight,
}: Props) {
  const [code, setCode] = useState<string>(STARTER_CODE);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  const runnerRef = useRef<SandboxRunner | null>(null);
  useEffect(() => {
    runnerRef.current = createSandboxRunner();
    return () => {
      runnerRef.current?.dispose();
      runnerRef.current = null;
    };
  }, []);

  // When a new question (different test cases) arrives, reset the run panel
  // so stale "all green" results don't mislead the candidate.
  const testCasesKey = useMemo(
    () => JSON.stringify(testCases?.map((t) => t.name) ?? []),
    [testCases]
  );
  useEffect(() => {
    setLastRun(null);
  }, [testCasesKey]);

  const hasQuestion = !!(testCases && testCases.length > 0);

  async function handleRun() {
    if (!hasQuestion || !runnerRef.current) return;
    setRunning(true);
    try {
      const result = await runnerRef.current.run({
        code,
        testCases: testCases!,
        timeoutMs: 2000,
        totalTimeoutMs: 8000,
      });
      setLastRun(result);
    } catch (e) {
      setLastRun({
        passed: 0,
        total: testCases!.length,
        results: [],
        stdout: "",
        runtime_ms: 0,
        fatal_error: e instanceof Error ? e.message : "Unknown sandbox error",
      });
    } finally {
      setRunning(false);
    }
  }

  function handleSubmit() {
    if (!hasQuestion || !lastRun) return;
    onSubmit({ code, testCases: testCases!, runResult: lastRun });
  }

  return (
    <div className="h-full flex flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">JavaScript</Badge>
          {hasQuestion ? (
            <span className="text-muted-foreground">
              {testCases!.length} test{testCases!.length === 1 ? "" : "s"} ·{" "}
              {testCases!.filter((t) => t.hidden).length} hidden
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" /> Editor unlocks when the interviewer
              asks for code
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRun}
            disabled={!hasQuestion || running || disabled}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">Run</span>
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={
              !hasQuestion || !lastRun || running || submitInFlight || disabled
            }
          >
            {submitInFlight ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">Submit & continue</span>
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language="javascript"
          value={code}
          onChange={(v) => setCode(v ?? "")}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            tabSize: 2,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            readOnly: !hasQuestion || disabled,
          }}
        />
      </div>

      {/* Test results */}
      <div className="border-t border-border max-h-[40%] overflow-y-auto">
        {!lastRun && (
          <div className="p-4 text-xs text-muted-foreground">
            {hasQuestion
              ? "Click Run to execute against the test suite."
              : "Waiting for the interviewer to ask for code."}
          </div>
        )}
        {lastRun?.fatal_error && (
          <div className="p-4 text-xs">
            <div className="text-red-600 dark:text-red-400 font-medium mb-1">
              Run failed
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
              {lastRun.fatal_error}
            </pre>
          </div>
        )}
        {lastRun && !lastRun.fatal_error && (
          <div className="divide-y divide-border">
            <div className="px-4 py-2 flex items-center justify-between text-xs">
              <span className="font-medium">
                {lastRun.passed}/{lastRun.total} passed
              </span>
              <span className="text-muted-foreground">
                {lastRun.runtime_ms}ms
              </span>
            </div>
            {lastRun.results.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "px-4 py-2 text-xs flex items-start gap-2",
                  r.passed
                    ? "bg-green-50/50 dark:bg-green-950/20"
                    : "bg-red-50/50 dark:bg-red-950/20"
                )}
              >
                {r.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-mono">
                    {r.name}
                    {r.hidden && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        hidden
                      </Badge>
                    )}
                  </div>
                  {!r.passed && !r.hidden && (
                    <div className="mt-1 text-muted-foreground font-mono text-[11px] break-words">
                      {r.error
                        ? `error: ${r.error}`
                        : `expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`}
                    </div>
                  )}
                  {!r.passed && r.hidden && (
                    <div className="mt-1 text-muted-foreground text-[11px] italic">
                      Hidden test failed — debug from the visible cases.
                    </div>
                  )}
                </div>
              </div>
            ))}
            {lastRun.stdout && (
              <div className="px-4 py-2">
                <div className="text-[11px] text-muted-foreground mb-1">
                  console.log
                </div>
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-muted-foreground max-h-32 overflow-y-auto">
                  {lastRun.stdout}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
