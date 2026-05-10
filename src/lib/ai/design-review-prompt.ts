import type {
  Diagram,
  DiagramNode,
  DiagramEdge,
  DesignReviewReport,
  DesignFollowUpQuestion,
  DesignQATurn,
} from "@/lib/types";
import { DIAGRAM_NODE_CONFIG, DIAGRAM_EDGE_KIND_CONFIG } from "@/lib/types";

/**
 * Render the user's diagram into compact text the model can reason over.
 *
 * Why text and not the raw JSON: models reason much better over a structured
 * narrative ("Client -> [HTTP] -> Load Balancer 'edge-LB' -> ...") than over
 * a sea of x/y coordinates. We strip layout, keep semantics.
 */
export function diagramToPromptText(diagram: Diagram): string {
  const { nodes, edges } = diagram;

  if (nodes.length === 0) {
    return "EMPTY DIAGRAM — no components were placed.";
  }

  const nodeById = new Map<string, DiagramNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const componentLines = nodes.map((n) => {
    const cfg = DIAGRAM_NODE_CONFIG[n.type];
    const notes = n.notes?.trim() ? ` — notes: ${n.notes.trim()}` : "";
    return `- [${n.id}] ${cfg.label} "${n.label || "(unlabeled)"}"${notes}`;
  });

  const connectionLines = edges.map((e) => describeEdge(e, nodeById));

  // Surface dangling nodes — useful signal for the AI ("Cache is drawn but
  // nothing connects to it").
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const orphans = nodes
    .filter((n) => n.type !== "note" && !connectedIds.has(n.id))
    .map((n) => `- [${n.id}] ${DIAGRAM_NODE_CONFIG[n.type].label} "${n.label || "(unlabeled)"}"`);

  const sections = [
    `COMPONENTS (${nodes.length}):`,
    componentLines.join("\n"),
    "",
    `CONNECTIONS (${edges.length}):`,
    connectionLines.length > 0 ? connectionLines.join("\n") : "- (none)",
  ];
  if (orphans.length > 0) {
    sections.push("", `UNCONNECTED COMPONENTS (${orphans.length}):`, orphans.join("\n"));
  }
  return sections.join("\n");
}

function describeEdge(
  edge: DiagramEdge,
  nodeById: Map<string, DiagramNode>
): string {
  const src = nodeById.get(edge.source);
  const tgt = nodeById.get(edge.target);
  const srcLabel = src
    ? `${DIAGRAM_NODE_CONFIG[src.type].label} "${src.label || src.id}"`
    : `[missing:${edge.source}]`;
  const tgtLabel = tgt
    ? `${DIAGRAM_NODE_CONFIG[tgt.type].label} "${tgt.label || tgt.id}"`
    : `[missing:${edge.target}]`;
  const kindLabel = DIAGRAM_EDGE_KIND_CONFIG[edge.kind].label;
  const lbl = edge.label?.trim() ? ` "${edge.label.trim()}"` : "";
  const notes = edge.notes?.trim() ? ` — ${edge.notes.trim()}` : "";
  return `- ${srcLabel} --[${kindLabel}${lbl}]--> ${tgtLabel}${notes}`;
}

// ---------------------------------------------------------------------------
// Critique prompt
// ---------------------------------------------------------------------------

export function buildReviewPrompt(input: {
  problemTitle: string;
  problemBrief: string;
  diagram: Diagram;
}): string {
  const diagramText = diagramToPromptText(input.diagram);

  return `You are a Staff+ engineer running a system design interview review.
The candidate has drawn a system architecture for the problem below. Judge it
the way a calibrated FAANG-level interviewer would: be direct, evidence-based,
and identify the real failure modes. Do NOT hand-wave.

# PROBLEM
Title: ${input.problemTitle}
Brief: ${input.problemBrief}

# CANDIDATE'S DIAGRAM
${diagramText}

# YOUR TASK
1. Score the design on 7 dimensions (each 0–5):
   - scalability        — Does it actually handle the stated load? Are bottlenecks identified?
   - availability       — How does it behave under partial failure (region down, AZ down)?
   - consistency        — Are the consistency choices appropriate for the workload? CAP positioning explicit?
   - data_model         — Schema sketch, sharding key, indexing strategy, hot keys.
   - bottlenecks        — Single points of failure, fan-out hotspots, queue back-pressure paths.
   - distributed_tradeoffs — Async vs sync, consistency vs latency, eventual vs strong, CAP.
   - operational        — Observability, deployments, blast radius, on-call story.

2. Compute overall_score (0–100) using a weighted average where scalability,
   bottlenecks, and distributed_tradeoffs each count double. Pick verdict by:
     >=85 strong, 70–84 solid, 55–69 workable, 40–54 gaps, <40 weak.

3. Produce 2–4 strengths (only real ones — if the design is weak, return fewer).

4. Produce 3–6 issues. Each issue must:
   - Pick severity from {critical, major, minor, nit}.
   - Identify which rubric area it belongs to (e.g. "scalability").
   - State a concrete observation (NOT generic advice).
   - Give a specific, actionable suggestion.
   - When the issue ties to a specific component, set references_node_id to
     the [id] shown above.

5. Generate 3–5 follow_up_questions a real interviewer would ask next. They
   must be Socratic ("How does X behave when Y fails?"), targeted at the
   weakest areas, and force the candidate to reason about scale,
   distributed-system trade-offs, or failure modes. For each:
   - id: short stable kebab-case slug.
   - focus_area: one of {scalability, availability, consistency, data_model,
     bottlenecks, distributed_tradeoffs, operational}.
   - expected_signals: 2–4 short bullets describing what a strong answer
     would mention (these are NOT shown to the user during answering — they
     are used by the grader later).

6. improved_design_hint: ONE sentence sketching what a 9/10 version would
   change. Concrete (e.g. "Add a Kafka log between writes and the search
   indexer to absorb spikes and decouple reindexing"), not generic.

# RESPONSE FORMAT
Respond with ONLY a single JSON object, no prose, no code fences:
{
  "overall_score": number,
  "verdict": "strong" | "solid" | "workable" | "gaps" | "weak",
  "rubric": {
    "scalability":           { "score": 0-5, "feedback": string },
    "availability":          { "score": 0-5, "feedback": string },
    "consistency":           { "score": 0-5, "feedback": string },
    "data_model":            { "score": 0-5, "feedback": string },
    "bottlenecks":           { "score": 0-5, "feedback": string },
    "distributed_tradeoffs": { "score": 0-5, "feedback": string },
    "operational":           { "score": 0-5, "feedback": string }
  },
  "strengths": [string],
  "issues": [
    {
      "severity": "critical" | "major" | "minor" | "nit",
      "area": string,
      "observation": string,
      "suggestion": string,
      "references_node_id": string | null
    }
  ],
  "follow_up_questions": [
    {
      "id": string,
      "question": string,
      "focus_area": "scalability" | "availability" | "consistency" | "data_model" | "bottlenecks" | "distributed_tradeoffs" | "operational",
      "expected_signals": [string]
    }
  ],
  "improved_design_hint": string
}`;
}

// ---------------------------------------------------------------------------
// Per-follow-up Q&A grading prompt
// ---------------------------------------------------------------------------

export function buildQAEvalPrompt(input: {
  problemTitle: string;
  problemBrief: string;
  diagramText: string;
  question: DesignFollowUpQuestion;
  userAnswer: string;
  priorTurns: DesignQATurn[];
}): string {
  const priorContext = input.priorTurns
    .filter((t) => t.ai_evaluation)
    .map(
      (t, i) =>
        `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.user_answer}\nScore: ${t.ai_evaluation?.score}/5`
    )
    .join("\n---\n");

  return `You are a Staff+ engineer grading a candidate's answer to a system
design follow-up. Be calibrated: 5/5 means "would impress in a real
interview", 3/5 means "correct but shallow", 1/5 means "missed the point".

# PROBLEM
${input.problemTitle}
${input.problemBrief}

# CANDIDATE'S DIAGRAM (for context)
${input.diagramText}

# CONVERSATION SO FAR
${priorContext || "(this is the first follow-up)"}

# CURRENT QUESTION
Focus area: ${input.question.focus_area}
Question: ${input.question.question}

# WHAT A STRONG ANSWER MUST MENTION (private rubric — DO NOT echo verbatim)
${input.question.expected_signals.map((s, i) => `${i + 1}. ${s}`).join("\n")}

# CANDIDATE'S ANSWER
${input.userAnswer}

# YOUR TASK
Score 0–5 based on coverage of the expected signals AND technical depth.
Write 1–3 sentences of feedback: what they got right, what was missing or wrong.
If a useful single follow-up would deepen their reasoning, include it; otherwise omit.

# RESPONSE FORMAT
Respond with ONLY a single JSON object, no prose, no code fences:
{
  "score": 0-5,
  "feedback": string,
  "follow_up": string | null
}`;
}

// ---------------------------------------------------------------------------
// Validation helpers — keep models honest after JSON.parse
// ---------------------------------------------------------------------------

const RUBRIC_KEYS = [
  "scalability",
  "availability",
  "consistency",
  "data_model",
  "bottlenecks",
  "distributed_tradeoffs",
  "operational",
] as const;

export function isValidReport(x: unknown): x is DesignReviewReport {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  if (typeof r.overall_score !== "number") return false;
  if (typeof r.verdict !== "string") return false;
  if (!r.rubric || typeof r.rubric !== "object") return false;
  const rubric = r.rubric as Record<string, unknown>;
  for (const k of RUBRIC_KEYS) {
    const dim = rubric[k] as { score?: unknown; feedback?: unknown } | undefined;
    if (!dim || typeof dim.score !== "number" || typeof dim.feedback !== "string") {
      return false;
    }
  }
  if (!Array.isArray(r.issues)) return false;
  if (!Array.isArray(r.follow_up_questions)) return false;
  if (!Array.isArray(r.strengths)) return false;
  return true;
}
