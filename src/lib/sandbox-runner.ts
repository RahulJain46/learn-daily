import type { RunResult, TestCase } from "@/lib/types";

/**
 * Minimal client-side wrapper around `/sandbox.html`.
 *
 * Why an iframe instead of a Web Worker:
 *   - Workers can't easily be killed mid-execution; iframes can be removed
 *     from the DOM, which forcibly tears down their JS context.
 *   - The `sandbox` attribute lets us drop same-origin/network privileges
 *     in one line, so a malicious snippet can't reach Supabase or the
 *     parent's storage.
 *
 * Lifecycle:
 *   const runner = createSandboxRunner();
 *   const result = await runner.run({ code, testCases, timeoutMs });
 *   runner.dispose();
 *
 * Each call creates a fresh iframe so user code can't poison subsequent runs
 * with global state.
 */

interface RunOptions {
  code: string;
  testCases: TestCase[];
  /** Per-test wall-clock timeout. Default 2000ms. */
  timeoutMs?: number;
  /** Whole-run timeout (covers all tests + harness load). Default 8000ms. */
  totalTimeoutMs?: number;
}

export interface SandboxRunner {
  run(opts: RunOptions): Promise<RunResult>;
  dispose(): void;
}

export function createSandboxRunner(): SandboxRunner {
  let activeIframes: HTMLIFrameElement[] = [];

  function makeIframe(): Promise<{ iframe: HTMLIFrameElement; window: Window }> {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.style.position = "absolute";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      iframe.src = "/sandbox.html";

      const onMessage = (e: MessageEvent) => {
        if (e.source !== iframe.contentWindow) return;
        if (e.data?.type === "ready") {
          window.removeEventListener("message", onMessage);
          if (!iframe.contentWindow) {
            reject(new Error("Sandbox iframe lost its window"));
            return;
          }
          resolve({ iframe, window: iframe.contentWindow });
        }
      };

      window.addEventListener("message", onMessage);
      document.body.appendChild(iframe);
      activeIframes.push(iframe);

      // Hard timeout if the iframe never signals ready (extremely rare).
      setTimeout(() => {
        window.removeEventListener("message", onMessage);
        if (!iframe.isConnected) return;
        reject(new Error("Sandbox failed to initialize (5s)"));
      }, 5000);
    });
  }

  function tearDown(iframe: HTMLIFrameElement) {
    if (iframe.isConnected) iframe.remove();
    activeIframes = activeIframes.filter((f) => f !== iframe);
  }

  async function run(opts: RunOptions): Promise<RunResult> {
    const totalTimeoutMs = opts.totalTimeoutMs ?? 8000;
    const perTestTimeoutMs = opts.timeoutMs ?? 2000;

    let iframe: HTMLIFrameElement | null = null;
    try {
      const ready = await makeIframe();
      iframe = ready.iframe;
      const sandboxWindow = ready.window;
      const runId = Math.random().toString(36).slice(2);

      const result = await new Promise<RunResult>((resolve) => {
        const onMessage = (e: MessageEvent) => {
          if (e.data?.type !== "result" || e.data.runId !== runId) return;
          window.removeEventListener("message", onMessage);
          clearTimeout(killTimer);
          resolve(e.data.payload as RunResult);
        };
        window.addEventListener("message", onMessage);

        const killTimer = setTimeout(() => {
          window.removeEventListener("message", onMessage);
          resolve({
            passed: 0,
            total: opts.testCases.length,
            results: [],
            stdout: "",
            runtime_ms: totalTimeoutMs,
            fatal_error: `Run exceeded total timeout of ${totalTimeoutMs}ms (likely infinite loop)`,
          });
        }, totalTimeoutMs);

        sandboxWindow.postMessage(
          {
            type: "run",
            runId,
            code: opts.code,
            testCases: opts.testCases,
            timeoutMs: perTestTimeoutMs,
          },
          "*"
        );
      });

      return result;
    } finally {
      if (iframe) tearDown(iframe);
    }
  }

  function dispose() {
    for (const f of activeIframes.slice()) tearDown(f);
  }

  return { run, dispose };
}
