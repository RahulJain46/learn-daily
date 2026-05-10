export type Category =
  | "dsa"
  | "system_design"
  | "backend"
  | "frontend"
  | "ai"
  | "concepts"
  | "languages";

export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "mcq" | "short_answer" | "flashcard";
export type Rating = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy

export const CATEGORY_CONFIG: Record<
  Category,
  { label: string; color: string; subcategories: string[] }
> = {
  dsa: {
    label: "DSA",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    subcategories: [
      "Arrays & Strings",
      "Linked Lists",
      "Trees & Graphs",
      "Dynamic Programming",
      "Sorting & Searching",
      "Stacks & Queues",
      "Heaps & Priority Queues",
      "Hashing",
      "Recursion & Backtracking",
      "Greedy",
      "Bit Manipulation",
      "Math & Geometry",
    ],
  },
  system_design: {
    label: "System Design",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    subcategories: [
      "Scalability",
      "Load Balancing",
      "Caching",
      "Databases & Storage",
      "Message Queues",
      "Microservices",
      "API Design",
      "Distributed Systems",
      "Consistency & Availability",
      "Monitoring & Logging",
    ],
  },
  backend: {
    label: "Backend",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    subcategories: [
      "Node.js",
      "Python",
      "Go",
      "Java / Spring",
      "REST APIs",
      "GraphQL",
      "Authentication",
      "Databases",
      "ORMs",
      "Testing",
    ],
  },
  frontend: {
    label: "Frontend",
    color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    subcategories: [
      "React",
      "Next.js",
      "TypeScript",
      "CSS & Tailwind",
      "State Management",
      "Performance",
      "Accessibility",
      "Browser APIs",
      "Testing",
    ],
  },
  ai: {
    label: "AI / ML",
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    subcategories: [
      "Machine Learning",
      "Deep Learning",
      "NLP",
      "Computer Vision",
      "LLMs & Prompting",
      "MLOps",
      "Data Processing",
    ],
  },
  concepts: {
    label: "Concepts",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    subcategories: [
      "Operating Systems",
      "Networking",
      "Security",
      "Design Patterns",
      "OOP",
      "Functional Programming",
      "Concurrency",
      "DevOps & CI/CD",
    ],
  },
  languages: {
    label: "Languages",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    subcategories: [
      "JavaScript",
      "TypeScript",
      "Python",
      "Go",
      "Rust",
      "Java",
      "C / C++",
      "SQL",
    ],
  },
};

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  streak_count: number;
  last_active_date: string | null;
  created_at: string;
}

export interface Entry {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: Category;
  subcategory: string | null;
  tags: string[];
  difficulty: Difficulty;
  created_at: string;
  updated_at: string;
}

export interface EntrySearchHit {
  id: string;
  title: string;
  category: Category;
  subcategory: string | null;
  tags: string[];
  /** Short context around the matched text — falls back to title for non-content hits. */
  snippet: string;
  /** Where the query matched first, used to render a small chip on each row. */
  matchedIn: "title" | "content" | "tag" | "category" | "subcategory";
}

export interface Card {
  id: string;
  user_id: string;
  entry_id: string;
  question_type: QuestionType;
  question: string;
  options: { text: string; isCorrect: boolean }[] | null;
  answer: string;
  stability: number;
  difficulty_score: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  due: string;
  last_review: string | null;
  created_at: string;
}

export interface RevisionSession {
  id: string;
  user_id: string;
  mode: string;
  category: string | null;
  cards_reviewed: number;
  correct_count: number;
  duration_seconds: number | null;
  completed_at: string;
}

export interface CardReview {
  id: string;
  user_id: string;
  session_id: string | null;
  card_id: string;
  user_answer: string | null;
  rating: Rating;
  time_taken_ms: number | null;
  reviewed_at: string;
}

// ============================================================
// Daily Notes (Phase 3)
// ============================================================

export interface Note {
  id: string;
  user_id: string;
  /** ISO date (YYYY-MM-DD) — calendar day in the user's local sense. */
  day: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NoteTodo {
  id: string;
  user_id: string;
  note_id: string;
  label: string;
  done: boolean;
  done_at: string | null;
  position: number;
  /** When this todo was pulled from a previous day, points to the source note. */
  carried_from_note_id: string | null;
  created_at: string;
}

export interface NotesSearchHit {
  noteId: string;
  day: string;
  /** Human-readable snippet showing where the term appeared. */
  snippet: string;
  matchedIn: "content" | "todo";
}

export interface WeeklySummaryTheme {
  title: string;
  detail: string;
}

export interface WeeklySummary {
  /** One-line capstone for the week, e.g. "A heavy concurrency week." */
  headline: string;
  /** 2–4 themes that thread through the week's notes. */
  themes: WeeklySummaryTheme[];
  todos_done: number;
  todos_carried: number;
  days_logged: number;
  /** Concrete suggestion for next week (one sentence). */
  suggestion: string;
  model_used?: string;
}

export type MockInterviewMode = "dsa" | "system_design" | "mixed" | "behavioral";
export type MockInterviewStatus = "in_progress" | "completed" | "abandoned";
export type InterviewLogStatus = "upcoming" | "completed" | "offer" | "rejected" | "cancelled";

export interface MockInterview {
  id: string;
  user_id: string;
  mode: MockInterviewMode;
  time_limit_minutes: number;
  total_questions: number;
  questions_answered: number;
  correct_count: number;
  score_percent: number | null;
  status: MockInterviewStatus;
  started_at: string;
  completed_at: string | null;
  /** Phase 2: distinguishes conversational sessions from card-based ones. */
  conversation_mode?: boolean | null;
  /** Phase 2: persisted FinalReport JSON (typed as unknown to avoid cycles). */
  final_report?: unknown;
  /** Phase 2: snapshot of the persona used. */
  interviewer_persona?: string | null;
}

export interface MockInterviewQuestion {
  id: string;
  mock_interview_id: string;
  card_id: string;
  question_order: number;
  user_answer: string | null;
  explanation: string | null;
  is_correct: boolean | null;
  time_taken_seconds: number | null;
  answered_at: string | null;
}

export interface InterviewLogEntry {
  id: string;
  user_id: string;
  company: string;
  role: string;
  interview_date: string | null;
  status: InterviewLogStatus;
  topics: string[];
  notes: string | null;
  reflection: string | null;
  difficulty: Difficulty | null;
  result_rating: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Conversational mock interview (Phase 2)
// ============================================================

export type ConversationRole = "interviewer" | "candidate" | "system";

export interface ConversationTurn {
  id: string;
  mock_interview_id: string;
  turn_index: number;
  role: ConversationRole;
  content: string;
  per_turn_signal: PerTurnSignal | null;
  code_submission_id: string | null;
  created_at: string;
}

/**
 * Lightweight per-turn signal the interviewer model emits.
 * Not shown to the user during the session (end-only feedback) but
 * used to weight the final report.
 */
export interface PerTurnSignal {
  coverage: number; // 0-5 — did they answer what was asked
  probe_depth: number; // 0-5 — depth/quality of reasoning
  clarity: number; // 0-5 — communication
  /** Brief private note the interviewer keeps to itself. */
  private_note?: string;
}

export interface TestCase {
  /** Short label shown to the user, e.g. "two_sum_basic". */
  name: string;
  /**
   * The function the candidate is expected to define. The harness will
   * call `solution(...args)` and compare against `expected`.
   */
  args: unknown[];
  expected: unknown;
  /** If true, hide details of args/expected from the UI on failure. */
  hidden?: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  error: string | null;
  hidden: boolean;
}

export interface RunResult {
  passed: number;
  total: number;
  results: TestResult[];
  stdout: string;
  runtime_ms: number;
  /** If the whole sandbox blew up (timeout, syntax error, etc.) */
  fatal_error: string | null;
}

export interface CodeSubmission {
  id: string;
  mock_interview_id: string;
  prompt_turn_index: number;
  language: "javascript";
  code: string;
  test_cases: TestCase[];
  run_result: RunResult | null;
  created_at: string;
}

export interface RubricDimension {
  score: number; // 0-5
  feedback: string;
}

/**
 * Final end-of-session report. Combines the existing 7-dimension Staff+
 * rubric (consistent with evaluate-answer.ts) with 4 conversational-only
 * dimensions that only make sense on a multi-turn transcript.
 */
export interface FinalReport {
  overall_score: number; // 0-100
  verdict:
    | "strong_hire"
    | "hire"
    | "leaning_hire"
    | "no_hire"
    | "strong_no_hire";
  staff_rubric: {
    technical_accuracy: RubricDimension;
    depth: RubricDimension;
    communication_clarity: RubricDimension;
    tradeoff_awareness: RubricDimension;
    staff_level_signal: RubricDimension;
    operational_excellence: RubricDimension;
    influence_communication: RubricDimension;
  };
  interview_rubric: {
    question_coverage: RubricDimension;
    probe_depth_handling: RubricDimension;
    recovery_after_pushback: RubricDimension;
    time_management: RubricDimension;
  };
  highlight_moments: string[];
  drop_off_moments: string[];
  improved_transcript: string;
  /** Which Gemini model was used. */
  model_used?: string;
}

export const CONVERSATIONAL_MODES: MockInterviewMode[] = ["dsa", "system_design"];

export const CONVERSATIONAL_INTERVIEW_CONFIG: Record<
  "dsa" | "system_design",
  {
    label: string;
    description: string;
    /** Soft cap on candidate turns before the interviewer wraps up. */
    maxCandidateTurns: number;
    /** Whether to show the code editor for this mode. */
    codeEditor: boolean;
    /** Web Speech voice tag the synth should prefer. */
    preferredVoice: string;
  }
> = {
  dsa: {
    label: "DSA (Conversational)",
    description:
      "Think out loud, then write JavaScript. The interviewer probes your approach, edge cases, and complexity.",
    maxCandidateTurns: 8,
    codeEditor: true,
    preferredVoice: "en-US",
  },
  system_design: {
    label: "System Design (Conversational)",
    description:
      "Design a system end-to-end. The interviewer pushes on scale, trade-offs, and operational realities.",
    maxCandidateTurns: 10,
    codeEditor: false,
    preferredVoice: "en-US",
  },
};

// ============================================================
// Knowledge Gap Analyzer (Phase 4)
// ============================================================

export type GapSeverity = "critical" | "high" | "medium" | "low";
export type ReadinessLevel =
  | "foundational"
  | "developing"
  | "proficient"
  | "advanced";

export interface GapItem {
  topic: string;
  category: Category | string;
  severity: GapSeverity;
  /** Short data-grounded statements that justify why this is a gap. */
  evidence: string[];
  suggested_actions: string[];
  /** 0..1 — how confident the model is, given how much data backs the call. */
  confidence: number;
}

export interface StudyPlanItem {
  /** Day index 1..7 in the upcoming week. */
  day: number;
  focus: string;
  action: string;
  est_minutes: number;
  /** Optional list of related entry ids the user already wrote on this topic. */
  linked_entries?: string[];
}

export interface RubricWeakness {
  /** One of the 7 staff rubric dimensions, e.g. "tradeoff_awareness". */
  dimension: string;
  avg_score: number; // 0..5
  sample_size: number;
  insight: string;
}

export interface GapReadout {
  overall_readiness: number; // 0..100
  level: ReadinessLevel;
  headline: string;
  one_liner: string;
}

/**
 * Numeric snapshot of the data the analysis was based on. Surfaced in the UI
 * so the user can see "why does the AI think this — what does it actually
 * know about me" without us having to recompute on render.
 */
export interface GapSignalsSummary {
  entries_total: number;
  cards_total: number;
  reviews_total: number;
  evaluations_total: number;
  mock_interviews_total: number;
  conversational_mocks_total: number;
  /** Categories with no entries / no reviews. */
  uncovered_categories: string[];
  /** Per-category accuracy (0..1) over recent reviews. */
  category_accuracy: Record<string, number>;
  /** Per-category review count (sample size for the accuracy number). */
  category_sample: Record<string, number>;
  /** Per-rubric-dimension average across all answer evaluations. */
  rubric_averages: Record<string, number>;
  /** Most-frequent missed_keywords across evaluations. */
  recurring_missed_keywords: string[];
  /**
   * Semantically-clustered recurring weaknesses derived from
   * answer_evaluations.gaps via pgvector cosine similarity. Each cluster
   * collapses paraphrases like "didn't mention consistent hashing" /
   * "missed hash ring" / "no rendezvous hashing" into one weakness. Empty
   * if pgvector is not yet populated for this user.
   */
  recurring_gap_clusters?: Array<{
    /** Representative gap text (the cluster's most central member). */
    label: string;
    /** Number of evaluations in which this weakness appeared. */
    occurrences: number;
    /** Average cosine similarity within the cluster (cohesion, 0..1). */
    cohesion: number;
  }>;
}

export interface KnowledgeGapAnalysis {
  id: string;
  user_id: string;
  window_start: string | null;
  window_end: string;
  signals_summary: GapSignalsSummary;
  readout: GapReadout;
  gaps: GapItem[];
  strengths: string[];
  study_plan: StudyPlanItem[];
  rubric_weakness: RubricWeakness[];
  model_used: string | null;
  created_at: string;
}

// ============================================================
// System Design Review & Critique (Phase 5)
// ============================================================

/**
 * The kind of architectural component a node on the canvas represents. We
 * keep this list deliberately compact — enough vocabulary to draw most
 * staff-level system design diagrams (URL shortener, Twitter feed, ride
 * sharing, etc.) without overwhelming the user with palette options.
 */
export type DiagramNodeType =
  | "client"
  | "mobile"
  | "cdn"
  | "load_balancer"
  | "api_gateway"
  | "service"
  | "worker"
  | "queue"
  | "cache"
  | "database"
  | "object_store"
  | "search"
  | "stream"
  | "external"
  | "note";

/** Edge semantics — drives how the AI interprets connection lines. */
export type DiagramEdgeKind =
  | "sync"
  | "async"
  | "replication"
  | "data"
  | "stream";

export interface DiagramNode {
  id: string;
  type: DiagramNodeType;
  label: string;
  /** Optional free-form note (e.g. "sharded by user_id, 3 replicas"). */
  notes?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional colour override for visual grouping. Tailwind class. */
  color?: string;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: DiagramEdgeKind;
  notes?: string;
}

export interface DiagramViewport {
  zoom: number;
  pan_x: number;
  pan_y: number;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport?: DiagramViewport;
}

export type DesignVerdict = "strong" | "solid" | "workable" | "gaps" | "weak";

export type DesignIssueSeverity = "critical" | "major" | "minor" | "nit";

export interface DesignIssue {
  severity: DesignIssueSeverity;
  /** Which rubric area the issue lives in, e.g. "scalability". */
  area: string;
  /** What the AI observed. */
  observation: string;
  /** Concrete suggestion to fix or improve. */
  suggestion: string;
  /** When the issue is tied to a specific node, the node id. */
  references_node_id?: string;
}

export interface DesignFollowUpQuestion {
  /** Stable id so user answers can be linked back. */
  id: string;
  question: string;
  /** Which dimension the AI is probing — drives chip colours in the UI. */
  focus_area:
    | "scalability"
    | "availability"
    | "consistency"
    | "data_model"
    | "bottlenecks"
    | "distributed_tradeoffs"
    | "operational";
  /** Bullet hints of what a strong answer should mention. Hidden until evaluated. */
  expected_signals: string[];
}

/**
 * AI critique. Mirrors the shape stored in `system_design_reviews.report`.
 * Score range mirrors the existing 7-dimension Staff+ rubric used elsewhere.
 */
export interface DesignReviewReport {
  overall_score: number; // 0-100
  verdict: DesignVerdict;
  rubric: {
    scalability: RubricDimension;
    availability: RubricDimension;
    consistency: RubricDimension;
    data_model: RubricDimension;
    bottlenecks: RubricDimension;
    distributed_tradeoffs: RubricDimension;
    operational: RubricDimension;
  };
  strengths: string[];
  issues: DesignIssue[];
  follow_up_questions: DesignFollowUpQuestion[];
  /** A 1–2 sentence sketch of what an improved design would change. */
  improved_design_hint: string;
  model_used?: string;
}

export interface DesignQAEvaluation {
  score: number; // 0-5
  feedback: string;
  /** If the AI wants to push further, a single follow-up question. */
  follow_up?: string;
}

export interface DesignQATurn {
  id: string;
  /** Foreign key into report.follow_up_questions[].id. */
  question_id: string;
  question: string;
  user_answer: string;
  ai_evaluation: DesignQAEvaluation | null;
  answered_at: string;
}

export type DesignReviewStatus = "draft" | "reviewed" | "archived";

export interface SystemDesignReview {
  id: string;
  user_id: string;
  problem_title: string;
  problem_brief: string;
  problem_template: string | null;
  diagram: Diagram;
  report: DesignReviewReport | null;
  qa_thread: DesignQATurn[];
  status: DesignReviewStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Built-in catalog of system design problems. Users can pick from these or
 * write a custom prompt. Kept short — we want quality over quantity.
 */
export const SYSTEM_DESIGN_PROBLEMS: {
  id: string;
  title: string;
  brief: string;
  /** Tags for the listing UI. */
  tags: string[];
}[] = [
  {
    id: "url_shortener",
    title: "URL Shortener (bit.ly)",
    brief:
      "Design a URL shortener that creates short codes for long URLs and redirects on visit. Targets: 100M new URLs/month, 10B redirects/month, p99 redirect latency under 100ms, analytics on each click.",
    tags: ["scalability", "caching", "key generation"],
  },
  {
    id: "twitter_feed",
    title: "News Feed (Twitter)",
    brief:
      "Design a home timeline service: users follow others and see ranked recent posts. Targets: 300M MAU, 500M posts/day, fan-out reads heavy, p99 timeline load under 200ms.",
    tags: ["fan-out", "ranking", "caching"],
  },
  {
    id: "chat_messaging",
    title: "Real-time Chat (WhatsApp)",
    brief:
      "Design a 1:1 and group messaging service with delivery receipts and presence. Targets: 1B users, 100B messages/day, end-to-end ordering per chat, mobile clients with intermittent connectivity.",
    tags: ["websockets", "ordering", "delivery"],
  },
  {
    id: "ride_sharing",
    title: "Ride Sharing (Uber)",
    brief:
      "Design driver-rider matching with live location tracking and surge pricing. Targets: 10M concurrent rides, sub-second nearest-driver match, geo-indexed dispatch.",
    tags: ["geo", "real-time", "matching"],
  },
  {
    id: "video_streaming",
    title: "Video Streaming (YouTube)",
    brief:
      "Design upload, transcoding, and streaming of user-generated video. Targets: 500h uploaded per minute, 1B daily viewers, adaptive bitrate streaming, global CDN.",
    tags: ["pipeline", "CDN", "storage"],
  },
  {
    id: "rate_limiter",
    title: "Distributed Rate Limiter",
    brief:
      "Design a global rate limiter as a sidecar service that any internal API can call. Targets: 10M QPS across the fleet, per-user and per-endpoint limits, sub-millisecond decision time, fault-tolerant.",
    tags: ["distributed counters", "consistency"],
  },
];

/**
 * Per-node visual config — used by both the canvas (icon + colour) and the
 * AI prompt builder (semantic role description).
 */
export const DIAGRAM_NODE_CONFIG: Record<
  DiagramNodeType,
  { label: string; description: string; color: string }
> = {
  client: {
    label: "Client",
    description: "Web browser end-user",
    color: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
  },
  mobile: {
    label: "Mobile",
    description: "Native mobile app",
    color: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
  },
  cdn: {
    label: "CDN",
    description: "Edge cache for static / cached responses",
    color: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700",
  },
  load_balancer: {
    label: "Load Balancer",
    description: "Layer 4/7 traffic distributor",
    color: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-700",
  },
  api_gateway: {
    label: "API Gateway",
    description: "Auth, routing, throttling entrypoint",
    color: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-700",
  },
  service: {
    label: "Service",
    description: "Stateless application service",
    color: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-700",
  },
  worker: {
    label: "Worker",
    description: "Background / async job consumer",
    color: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-100 dark:border-indigo-700",
  },
  queue: {
    label: "Queue",
    description: "Message broker (Kafka / SQS / RabbitMQ)",
    color: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-900/40 dark:text-orange-100 dark:border-orange-700",
  },
  cache: {
    label: "Cache",
    description: "In-memory KV store (Redis / Memcached)",
    color: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-700",
  },
  database: {
    label: "Database",
    description: "OLTP store (SQL / NoSQL)",
    color: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-900/40 dark:text-purple-100 dark:border-purple-700",
  },
  object_store: {
    label: "Object Store",
    description: "Blob storage (S3 / GCS)",
    color: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-900/40 dark:text-purple-100 dark:border-purple-700",
  },
  search: {
    label: "Search Index",
    description: "Inverted index (Elasticsearch / OpenSearch)",
    color: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-100 dark:border-cyan-700",
  },
  stream: {
    label: "Stream Processor",
    description: "Real-time pipeline (Flink / Spark Streaming)",
    color: "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-900/40 dark:text-teal-100 dark:border-teal-700",
  },
  external: {
    label: "External API",
    description: "Third-party dependency",
    color: "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-600",
  },
  note: {
    label: "Note",
    description: "Annotation / sticky note",
    color: "bg-yellow-50 text-yellow-900 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-700",
  },
};

export const DIAGRAM_EDGE_KIND_CONFIG: Record<
  DiagramEdgeKind,
  { label: string; description: string; dashed: boolean }
> = {
  sync: { label: "sync", description: "Synchronous request/response", dashed: false },
  async: { label: "async", description: "Async / fire-and-forget", dashed: true },
  replication: { label: "replication", description: "DB / cache replication", dashed: false },
  data: { label: "data", description: "Bulk / batch data flow", dashed: false },
  stream: { label: "stream", description: "Continuous event stream", dashed: true },
};

export const MOCK_INTERVIEW_CONFIG: Record<MockInterviewMode, { label: string; description: string; timeMinutes: number; questionCount: number }> = {
  dsa: {
    label: "DSA",
    description: "Data structures & algorithms — coding problems focus",
    timeMinutes: 30,
    questionCount: 8,
  },
  system_design: {
    label: "System Design",
    description: "Architecture, scalability, and distributed systems",
    timeMinutes: 45,
    questionCount: 6,
  },
  mixed: {
    label: "Full Interview",
    description: "Mixed topics simulating a complete interview round",
    timeMinutes: 60,
    questionCount: 12,
  },
  behavioral: {
    label: "Behavioral",
    description: "Soft skills, leadership, and situational questions",
    timeMinutes: 30,
    questionCount: 6,
  },
};
